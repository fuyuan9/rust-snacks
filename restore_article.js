const fs = require('fs');
const { execSync } = require('child_process');

const { parseMarkdown, repairMarkdownMermaidBlocks } = require('./packages/renderer/dist/markdown.js');
const { renderLayout } = require('./packages/renderer/dist/layout.js');

const originalMd = `# Tauriに学ぶシステムプログラミング Part 1: ビルドタイム・メタプログラミングとIPC高速化

- **対象コミットSHA:** \`7cd71369c00978a3783b6ae3e9972358abbe4ae6\`
- **解析日:** 2026-07-01

## 1. 概要

デスクトップおよびモバイル向け軽量フロントエンドフレームワークである **Tauri** は、Electronに代表される「Chromiumを丸ごと配布する」アプローチとは一線を画し、OS標準のネイティブWebview（Wry/Tao）を最大限活用することで、驚異的なフットプリントの軽さを実現しています。

Tauriが優れているのはそのランタイムパフォーマンスだけではありません。開発者が直面する安全なプロセス間通信（IPC）やリソース管理といった難題を、**Rustのビルドスクリプト（\`build.rs\`）とマクロによる「コンパイル時メタプログラミング」**で解決している点にあります。

本記事（Part 1）では、Tauriがどのようにビルドフェーズで最適化やデータ検証を行い、実行時の負荷を最小限に抑えているのか、その設計と具体的なRustの実装パターンを解説します。

---

## 2. アーキテクチャ

Tauriは、ビルド時に「静的なリソース検証、OS依存マニフェストの生成、IPCハンドラーの静的解決」を徹底的に行い、実行時には「最小限のオーケストレーターと安全なメッセージングパス」のみをロードします。

以下は、Tauriにおけるビルドプロセス（\`tauri-build\`等）からバイナリ生成、そして実行時のIPCへと繋がるアーキテクチャの境界線を示した図です。

\`\`\`mermaid
graph TD
  subgraph BuildTime [ビルドタイム (Cargo / build.rs)]
    A["tauri.conf.json (設定ファイル)"] -->|解析| B["tauri-build (コードジェネレータ)"]
    B -->|静的生成| C["埋め込みアセット / ACL解決済みメタデータ"]
    B -->|Cargo連携| D["cargo:rustc-env (環境変数注入)"]
  end

  subgraph Runtime [ランタイム (Rustバイナリ & WebView)]
    E["WebView (Frontend)"] -->|安全なIPC呼び出し| F["Tauri Core (ipc/authority.rs)"]
    F -->|コンパイル時ルーティング| G["Rust コマンドハンドラー (command)"]
    C -->|メモリから直接ロード| G
    D -->|コンパイル時静的アサーション等| G
  end

  D -->|rustcコンパイル| G
\`\`\`

この設計により、実行時に高価な「ディレクトリ走査」「設定ファイルのパース」「文字列による動的なIPCルーティング」を排除し、安全で高速な起動を実現しています。

---

## 3. この記事で学べること

1. **\`AsRef<Path>\` を用いたエルゴノミクスと静的ディスパッチの両立**
2. **ビルドスクリプト（\`build.rs\`）からCargoへの状態通知と環境変数インジェクション**
3. **ビットシフト演算を用いたセマンティックバージョニング（SemVer）のビット圧縮パターン**
4. **マクロによるコンパイル時IPCルート解決とランタイム性能の向上**

---

## 4. 実践的な実装・コード解説

### Tip 1: \`AsRef<Path>\` パターンによる柔軟なファイルパスAPI

Tauri内部では、静的ファイルの読み込みやビルド時のディレクトリ走査など、パス（Path）を扱う処理が頻繁に登場します。具象型（\`PathBuf\` や \`&str\`）を直接引数に取るのではなく、\`AsRef<Path>\` を用いたジェネリック記述をすることで、呼出側の利便性を高めています。

\`\`\`rust
use std::path::Path;
use std::io::Result;

// 実践的なヘルパー関数の実装例
fn copy_file_safely(from: impl AsRef<Path>, to: impl AsRef<Path>) -> Result<()> {
    let from_path = from.as_ref();
    let to_path = to.as_ref();
    
    // メモ: 実装側では as_ref() によって &Path に統一され、単一のコードとして単相化されます
    if from_path.exists() {
        std::fs::copy(from_path, to_path)?;
    }
    Ok(())
}

#[test]
fn test_path_usability() {
    // 様々な型からシームレスに呼び出せるため、呼出側での明示的な変換 (.to_path_buf()など) が不要
    assert!(copy_file_safely("assets/icon.png", "/tmp/icon.png").is_ok());
}
\`\`\`

* **事実としてのコード挙動**: \`impl AsRef<Path>\` を利用することで、\`String\`、\`&str\`、\`PathBuf\`、\`&Path\` いずれも変換コストなしで受け取ることができ、コンパイラによって静的ディスパッチ（単相化）されます。

---

### Tip 2: ビルドスクリプト（\`build.rs\`）とCargoの双方向連携

Tauriはフロントエンドの静的アセット変更を検知したり、ビルド時の各種環境パラメータをRustコードに埋め込むため、ビルドスクリプト内で標準出力命令（\`cargo:xxx\`）を積極的に利用しています。

\`\`\`rust
// build.rs の実装例
fn main() {
    let src_dir = std::path::Path::new("src/frontend");
    
    // 1. 指定ディレクトリ以下の変更があった場合のみ再ビルドをトリガーする
    println!("cargo:rerun-if-changed={}", src_dir.display());
    
    // 2. 実行時コンパイル環境に任意のカスタムマクロ/環境変数を注入する
    let package_prefix = "com.tauri.app";
    println!("cargo:rustc-env=TAURI_ANDROID_PACKAGE_NAME_PREFIX={package_prefix}");
}
\`\`\`

これにより、開発中にフロントエンドコードが書き換わった際に、Cargoが賢く変更を検知し自動ビルド（再インジェクション）を実行してくれます。また、\`env!("TAURI_ANDROID_PACKAGE_NAME_PREFIX")\` を通じて、実行時Rustコードからこの値にアクセスできます。

---

### Tip 3: セマンティックバージョン（SemVer）の64ビット圧縮スキーム

Windowsのリソースファイル（\`.rc\`）や特定のプラットフォームAPIでは、文字列ベースのバージョン（\`"1.2.14-beta"\`）ではなく、\`u64\` などの整数値でシステムバージョンを提供する必要があります。Tauriではこれを解決するため、ビルド時にSemVerを以下のシフト演算スキームでコンパクトな整数へ圧縮しています。

\`\`\`rust
use semver::Version;

/// SemVer 構造体を Windows 等のレガシーAPIと互換性のある 64-bit 整数にエンコードする
fn to_winres_version(v: &Version) -> u64 {
    // ビルドメタデータ部分が数値としてパースできる場合は抽出し、できない場合は0とする
    let build = v.build.parse::<u16>().map(u64::from).unwrap_or(0);
    
    // 各フィールドを16ビットずつシフトさせ、合成する
    (v.major << 48) | (v.minor << 32) | (v.patch << 16) | build
}

#[test]
fn test_version_compression() {
    let ver = Version::parse("2.14.3").unwrap();
    let compressed = to_winres_version(&ver);
    
    // 各要素が特定のビット位置に正確にパースされていることを検証
    assert_eq!(compressed >> 48, 2);
    assert_eq!((compressed >> 32) & 0xFFFF, 14);
    assert_eq!((compressed >> 16) & 0xFFFF, 3);
}
\`\`\`

* **メリット**: ランタイム側での複雑な正規表現によるパースや、文字列処理によるオーバーヘッドを一切排除できます。

---

### Tip 4: マクロを用いたコンパイル時IPC解決

Tauriの最大の特徴は、フロントエンドからのメッセージ呼び出しを「静的に解決する」ルーティングです。\`tauri::generate_handler![cmd1, cmd2]\` のようにマクロを使用することで、動的なリフレクションやMap検索を排除しています。

以下は、Tauriが背後で行っている「マクロを介した静的なディスパッチ解決」の簡略化されたモックパターンです。

\`\`\`rust
// フロントエンドから届くリクエストを模した構造体
struct IpcRequest {
    command: String,
    payload: String,
}

// マクロ展開後に生成されるハンドラートレイトの簡易表現
trait CommandHandler {
    fn handle(&self, req: IpcRequest) -> Option<String>;
}

// 実際のユーザー定義コマンド（Tauriマクロによるシグネチャ自動生成の疑似再現）
fn greet_command(payload: &str) -> String {
    format!("Hello, {payload}!")
}

// 静的解決を行うためのディスパッチャー
fn dispatch_ipc(req: IpcRequest) -> String {
    // 実行時に動的マップ（HashMap）を使用する代わりに、
    // コンパイル時に生成される match 式によってルーティングを確定する
    match req.command.as_str() {
        "greet" => greet_command(&req.payload),
        _ => "Unknown command".to_string(),
    }
}
\`\`\`

* **事実**: Tauriでは \`tauri::generate_handler!\` マクロがこの \`match\` ブロック（より厳密な型制約を伴う分岐）をコンパイル時に展開します。これにより、シリアライズ速度の劇的な向上とセキュリティの担保を両立させています。

---

## 5. 実務に持ち帰れるTips

1. **「何でも \`String\`」から \`impl AsRef<Path>\` や \`impl Into<String>\` への移行**
   - ライブラリや再利用モジュールを設計する際、呼び出し元への変換コストを押し付けず、かつコードサイズ膨張（静的単相化の影響）とのバランスを取りながら抽象トレイトを受け取るAPI設計を心がけましょう。
2. **ビルドスクリプトを活用した「静的な環境アサーション」**
   - アプリケーションが動作するために必須の外部バイナリ、ライブラリ、アセットが存在する場合、ランタイムエラーではなくビルドスクリプト（\`build.rs\`）でのファイル存在チェック（\`rerun-if-changed\`）を組み合わせることで、配備ミスをコンパイル時に防ぎます。
3. **シリアライズが必要なルーティングでの「動的Map of 排除」**
   - Webフレームワークのような動的ルーティングが不要な組み込みシステムやデスクトップクライアントでは、マクロを用いてすべてのシグネチャを静的なマクロルーティングに落とし込むことで、実行速度の大幅な向上と安全性が確保できます。

---

## 6. トレードオフと注意点

### コンパイル時間（ビルド時間）の増大

Tauriの手法は「実行時パフォーマンス」を極限まで追求する一方、**ビルド時間**というコストを支払っています。マクロの多用や、\`build.rs\` でのフロントエンドリソース（HTML/JS/CSS）の読み込み、およびそれらの事前解析プロセスは、開発時のコンパイル時間を長くする原因になります。

### プラットフォーム間の抽象化リーク

Windows向けの \`to_winres_version\` のようなOS特有のAPIやアセット圧縮は、非互換な環境（例: LinuxやmacOSなどでのビルド）でコンパイル条件分岐（\`#[cfg(target_os = "windows")]\`）を精緻にコントロールしなければ、ビルド自体の破損を引き起こしやすくなります。条件分岐のスパゲッティ化を防ぐ抽象レイヤーが必要です。

---

## 7. まとめ

Tauriの圧倒的な軽快さは、単に「ElectronをRustで書き換えたから」ではありません。**「実行時にやる必要のない仕事は、すべてビルド時に片付ける」**という徹底した静的アプローチの賜物です。

- \`AsRef<Path>\` や \`AsRef<[u8]>\` で抽象化された堅牢なデータ処理
- \`build.rs\` を用いた Cargo コンパイル環境への深い介入
- セマンティックバージョンの数値変換、そしてマクロによる静的IPCルーティング

これらのアプローチは、私たちが自作のCLIツールやWebサーバー、ライブラリを設計する際にも大いに役立ちます。

次回 **Part 2** では、Tauriの **「WryとTaoを用いたウインドウ抽象化レイヤーの設計とマルチプラットフォーム対応」** について深掘りします。お楽しみに！`;

async function main() {
  console.log("Applying repairMarkdownMermaidBlocks on clean original markdown...");
  const repairedMd = repairMarkdownMermaidBlocks(originalMd);
  
  // Metadata for the article (hardcoded based on what is in D1)
  const article = {
    title: "Tauriに学ぶシステムプログラミング Part 1: ビルドタイム・メタプログラミングとIPC高速化の秘訣",
    target_commit_sha: "7cd71369c00978a3783b6ae3e9972358abbe4ae6",
    analyzed_at: "2026-07-01T23:18:14.725Z"
  };
  const tags = ["Rust", "Tauri", "SystemsProgramming", "Metaprogramming"];
  const seo = {
    title: "Tauriに学ぶRustシステムプログラミング - ビルドメタデータとIPC高速化",
    description: "Tauriのコアアーキテクチャからビルドスクリプト、メタプログラミング、IPC高速化のRust実装パターンを学びます。",
    keywords: "rust, tauri, system programming, compile-time, build.rs"
  };
  
  const bodyHtml = parseMarkdown(repairedMd);
  const repo = { owner: "tauri-apps", name: "tauri" };
  
  console.log("Generating complete HTML with layout...");
  const completeHtml = renderLayout({
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    bodyHtml: `
      <article class="content-body">
        <div class="article-header">
          <h1 class="article-title">${article.title}</h1>
          <div class="meta-info">
            <div class="meta-item">解析日: ${new Date(article.analyzed_at).toLocaleDateString("ja-JP")}</div>
            <div class="meta-item">対象コミット: <a href="https://github.com/${repo.owner}/${repo.name}/commit/${article.target_commit_sha}" target="_blank">${article.target_commit_sha.substring(0, 7)}</a></div>
            <div class="meta-item">リポジトリ: <a href="https://github.com/${repo.owner}/${repo.name}" target="_blank">${repo.owner}/${repo.name}</a></div>
          </div>
          <div class="tags">
            ${tags.map((t) => `<span class="tag">${t}</span>`).join("")}
          </div>
        </div>
        ${bodyHtml}
      </article>
    `,
  });
  
  fs.writeFileSync('repaired.md', repairedMd, 'utf8');
  fs.writeFileSync('repaired.html', completeHtml, 'utf8');
  
  const sqlEscapedMd = repairedMd.replace(/'/g, "''");
  const sqlEscapedHtml = completeHtml.replace(/'/g, "''");
  
  const sql = `UPDATE articles SET body_markdown = '${sqlEscapedMd}', body_html = '${sqlEscapedHtml}' WHERE slug = 'tauri-system-patterns-part1-build-metadata-ipc';`;
  fs.writeFileSync('query.sql', sql, 'utf8');
  
  console.log("Updating remote D1 database via file...");
  const updateCmd = `npx wrangler d1 execute rust-snacks-db --remote --file=query.sql`;
  execSync(updateCmd, { stdio: 'inherit' });
  fs.unlinkSync('query.sql');
  
  console.log("Uploading complete HTML to remote R2 bucket...");
  const r2Cmd = `npx wrangler r2 object put rust-snacks-bucket/articles/tauri-system-patterns-part1-build-metadata-ipc.html --file repaired.html --content-type text/html --remote`;
  execSync(r2Cmd, { stdio: 'inherit' });
  
  console.log("Clearing R2 cache index/rss/sitemap files...");
  try {
    execSync(`npx wrangler r2 object delete rust-snacks-bucket/index.html --remote`, { stdio: 'inherit' });
    execSync(`npx wrangler r2 object delete rust-snacks-bucket/rss.xml --remote`, { stdio: 'inherit' });
    execSync(`npx wrangler r2 object delete rust-snacks-bucket/sitemap.xml --remote`, { stdio: 'inherit' });
  } catch (e) {
    console.log("Note: some cache files might not exist yet, ignoring delete errors.");
  }
  
  fs.unlinkSync('repaired.md');
  fs.unlinkSync('repaired.html');
  console.log("Restore and repair completed successfully!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
