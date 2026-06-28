# Rust Snacks 🦀

Rust OSSのリポジトリから設計思想、アーキテクチャ、実装パターンを学び取るための、毎日自動更新される解説メディアシステムです。

Next.jsは使用せず、Cloudflare Workers + Hono + TypeScript の軽量スタックで完結しています。D1（メタデータ保存）、R2（静的HTML・アセット保存）、KV（キャッシュ）、Queues（非同期パイプライン）、Cron Triggers（日次自動実行）を活用し、LLMによる自動解析とシリーズ記事生成、品質ゲート検証を行います。

## 特徴
- **完全自動運転**: 日次で自動でRust OSSを収集・スコアリング・選定・スナップショット・解析・執筆・公開。
- **連載（シリーズ）自動生成**: 長い解説記事を避け、1テーマに絞った読み切れる長さで必要に応じてシリーズ分割。進行中の連載がある場合は優先的に前回のコンテキストを引き継ぎ、Part N+1 の続きを自動生成。
- **R2優先配信**: 記事やインデックスはR2から直接配信し、キャッシュがない場合のみD1からフォールバック生成する高速・高耐障害性設計。
- **ジョブの分散チェーン**: 重い処理をQueueで収集、選定、スナップショット、生成に分離し、Workersの実行制限を回避。
- **XSSサニタイズとセキュア設計**: 外部READMEやLLMから混入する悪意あるスクリプトを自動排除するサニタイズ処理を実装。Mermaid描画時のセキュリティ設定を引き締め。
- **自動テスト検証**: スコアリングや品質ゲート等のビジネスロジックは、`vitest` によるユニットテストで動作保証。

---

## 開発環境セットアップ

### 1. 依存関係のインストール
pnpm workspace を利用しています。
```bash
pnpm install
```

### 2. ローカルでの動作確認 (Wrangler)
ローカル環境で動作検証やデバッグを行うためには、APIキーなどの環境変数をローカル用に設定する必要があります。

#### ① `.dev.vars` の作成
プロジェクトのルートディレクトリ（`wrangler.toml` と同じディレクトリ）に `.dev.vars` という名前のファイルを作成し、以下のように必要なシークレットを入力します。

```env
LLM_API_KEY=your-gemini-api-key
GITHUB_TOKEN=your-github-token
ADMIN_API_KEY=local-dev-admin-key
```

#### ② 開発サーバーの起動
```bash
pnpm dev
```

### 3. BiomeによるフォーマットとLint
```bash
pnpm lint
pnpm format
```

### 4. 単体テストの実行
```bash
pnpm test
```

---

## Cloudflare リソースのセットアップ

本番環境にデプロイする前に、以下のCloudflareリソースを作成してください。

### 1. D1 データベースの作成
```bash
npx wrangler d1 create rust-snacks-db
```
出力された `database_id` をローカルの `wrangler.toml` に反映してください（テンプレートである [wrangler.toml.example](./wrangler.toml.example) をコピーして作成してください）。

> [!WARNING]
> Wrangler出力に表示される `binding = "rust_snacks_db"` は**使用せず**、コードとの整合性を保つために必ず `binding = "DB"` のままにしてください。

### 2. R2 バケットの作成
```bash
npx wrangler r2 bucket create rust-snacks-bucket
```

> [!NOTE]
> `code: 10042`（R2を有効にしてください）というエラーが表示された場合は、Cloudflareダッシュボードにブラウザでログインし、「R2」メニューからプラン（無料枠）の有効化手続きを行ってから再実行してください。

### 3. KV ネームスペースの作成
Wranglerの最新仕様に基づき、コロンではなくスペースで指定します。
```bash
npx wrangler kv namespace create rust_snacks_kv
```

### 4. Queueの作成
```bash
npx wrangler queues create rust-snacks-queue
```

### 5. D1の初期マイグレーション実行
ローカル環境：
```bash
npx wrangler d1 migrations apply rust-snacks-db --local
```
本番環境：
```bash
npx wrangler d1 migrations apply rust-snacks-db --remote
```

### 6. Secrets (APIキー) の設定
本番環境での実行に必要なAPIトークンとキーを設定します。
```bash
npx wrangler secret put GITHUB_TOKEN # GitHub Personal Access Token (PAT)
npx wrangler secret put LLM_API_KEY  # Gemini などの LLM API キー
npx wrangler secret put SITE_DOMAIN   # 配信用の絶対ドメイン名 (例: rust-snacks.pages.dev)
npx wrangler secret put ADMIN_API_KEY # 手動・デバッグAPI用の認証キー (任意の安全な文字列)
```

> [!TIP]
> **GITHUB_TOKEN（GitHub Personal Access Token）の取得手順**
> 1. GitHubにログインし、右上のアイコン ➔ [Settings] ➔ 左サイドバー最下部の [Developer settings] ➔ [Personal access tokens] ➔ [Tokens (classic)] を開きます。
> 2. **Generate new token (classic)** をクリックし、任意の有効期限を設定します。
> 3. スコープ選択で **`public_repo`** にチェックを入れます（公開リポジトリの解析・スター数等の取得のみに使用するため）。
> 4. 生成された `ghp_...` で始まるトークン文字列をコピーし、上記の `wrangler secret put GITHUB_TOKEN` の入力時に貼り付けます。

### 7. 本番環境への初期デプロイ
すべてのリソースおよびシークレットの設定が完了したら、以下のコマンドで本番環境にアプリをデプロイします。
```bash
pnpm run deploy
```

---

## AI 記事生成パイプラインの動作

Cron Trigger または Queue メッセージによって、以下の流れで段階的に非同期実行されます。

1. **candidate_collection**: GitHub Search API でスター数等の条件を満たすRustリポジトリ候補を収集し、D1に一時保存。
2. **repository_selection**: D1から「現在進行中かつ未完の連載（`series_index < series_total`）」があるリポジトリを最優先で選定。無い場合は、収集されたリポジトリからスコアリング（スター・フォーク・更新頻度等）を元に自動選定。
3. **snapshot**: 選定リポジトリのREADME、Cargo.toml、主要コード（`lib.rs`/`main.rs`）を取得し、制限サイズ内に切り詰めてR2およびD1にスナップショットとして保存。
4. **article_generation**: スナップショットのファイルをLLM (デフォルト: Gemini 1.5 Flash) に入力し、解析と記事執筆を行います。
   - 文字数制限（15,000文字以内）、Tips最大5個、Mermaid図最大3個の制約を判定。
   - 連載継続時は前回の解説タイトルと要約をコンテキストにインジェクトし、Part N+1 として自動継続。
   - 品質ゲート (Quality Gate) を自動検証し、合格すれば `published` として即時公開、不合格なら `needs_review` として下書き保存。
   - **連載の一括事前生成**: AIが「連載記事である（`is_series = 1` 且つ `series_total > 1`）」と判定した場合、その場で Part 2 から Part N までの全記事を順次 LLM を叩いて連続生成し、`needs_review`（下書き）ステータスで D1 に事前保存します。

---

## 運用方法

### 1. 記事・ジョブの状態確認（D1クエリ）

#### 登録されている記事のステータス・公開日時を確認する：
```bash
npx wrangler d1 execute rust-snacks-db --remote --command="SELECT id, title, slug, status, published_at FROM articles;"
```

#### バックグラウンドで実行されたジョブの状態を確認する：
```bash
npx wrangler d1 execute rust-snacks-db --remote --command="SELECT id, job_type, status, error_message FROM jobs ORDER BY id DESC LIMIT 5;"
```

---

### 2. 記事の公開 / 非公開の切り替え方法

#### 記事を強制公開（needs_review や下書きから公開）する場合：
1. D1 で該当記事のステータスを `published` に変更し、公開日時を設定します。
```bash
npx wrangler d1 execute rust-snacks-db --remote --command="UPDATE articles SET status = 'published', published_at = datetime('now') WHERE id = 3;"
```
2. 本番配信サーバー（R2）のキャッシュファイルを削除します（Wranglerコマンドではスラッシュ `/` でバケット名とキーを連結します）。
```bash
npx wrangler r2 object delete rust-snacks-bucket/index.html --remote
npx wrangler r2 object delete rust-snacks-bucket/rss.xml --remote
npx wrangler r2 object delete rust-snacks-bucket/sitemap.xml --remote
```

#### 記事を一括・または個別に非公開（下書き）にする場合：
1. D1 でステータスを `unpublished`（非公開）または `needs_review` に戻します。
```bash
npx wrangler d1 execute rust-snacks-db --remote --command="UPDATE articles SET status = 'unpublished' WHERE id = 3;"
```
2. R2から該当記事の静的 HTML キャッシュ、およびインデックス等の配信ファイルを削除します。
```bash
npx wrangler r2 object delete rust-snacks-bucket/articles/your-article-slug.html --remote
npx wrangler r2 object delete rust-snacks-bucket/index.html --remote
npx wrangler r2 object delete rust-snacks-bucket/rss.xml --remote
npx wrangler r2 object delete rust-snacks-bucket/sitemap.xml --remote
```

> [!NOTE]
> **キャッシュ削除後のオンデマンド自動生成**
> R2から削除された `index.html`, `rss.xml`, `sitemap.xml` は、次のユーザーアクセスがあった瞬間に自動的にD1の最新公開データに基づいてバックグラウンドで再生成され、R2にキャッシュされます。

---

### 3. 記事生成の手動起動方法
日次の Cron Trigger を待たずに手動でパイプラインを起動するためのセキュアなエンドポイント（`POST /api/jobs/trigger`）が用意されています。

##### フルパイプライン（収集から開始）を起動する場合：
```bash
curl -X POST https://your-domain.com/api/jobs/trigger \
  -H "Authorization: Bearer your-admin-key"
```

##### 特定のリポジトリ（D1のID: 10）を直接指定して、Snapshot 取得 & 解析・記事執筆を起動する場合：
```bash
curl -X POST https://your-domain.com/api/jobs/trigger \
  -H "Authorization: Bearer your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"repositoryId": 10}'
```

---

### 4. ローカル同期デバッグAPI（開発用・同期実行）
開発中にQueueのバックグラウンド実行を待つことなく、同期処理で即時に記事を自動生成させ、その場ですぐにマークダウンのレンダリング・Prismによるハイライト・Mermaid の動作をデバッグするためのエンドポイント（`GET /api/debug/generate`）が用意されています。

#### 使い方（ブラウザでのアクセス）
ローカル開発サーバー（`pnpm dev`）を立ち上げた状態で、ブラウザから以下の URL に直接アクセスします。

```text
http://localhost:8787/api/debug/generate?key=local-dev-admin-key&repoId=10
```

- **`key`**: wrangler.toml の `[vars]` で設定されている `ADMIN_API_KEY` の値（ローカル開発時の初期値: `local-dev-admin-key`）を入力します。
- **`repoId`** (オプション): D1 に候補登録されているリポジトリIDを指定します。指定しない場合は、自動スコアリングに基づいてトップのリポジトリが自動選定されます。

#### 挙動
実行すると、ブラウザ上で数秒間待機した後、**新しく生成された記事ページ（`http://localhost:8787/articles/your-slug`）へと自動的にリダイレクト**され、記事の見た目やシンタックスハイライトが効いているかを即時に調整できます。
