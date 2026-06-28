# Rust Snacks 🦀

Rust OSSのリポジトリから設計思想、アーキテクチャ、実装パターンを学び取るための、毎日自動更新される解説メディアシステムです。

Next.jsは使用せず、Cloudflare Workers + Hono + TypeScript の軽量スタックで完結しています。D1（メタデータ保存）、R2（静的HTML・アセット保存）、KV（キャッシュ）、Queues（非同期パイプライン）、Cron Triggers（日次自動実行）を活用し、LLMによる自動解析とシリーズ記事生成、品質ゲート検証を行います。

## 特徴
- **完全自動運転**: 日次で自動でRust OSSを収集・スコアリング・選定・スナップショット・解析・執筆・公開。
- **連載（シリーズ）自動生成**: 長い解説記事を避け、1テーマに絞った読み切れる長さ（3000文字以内、Tips最大5個、図最大3個）で必要に応じてシリーズ分割。進行中の連載がある場合は優先的に前回のコンテキストを引き継ぎ、Part N+1 の続きを自動生成。
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
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put LLM_API_KEY
npx wrangler secret put SITE_DOMAIN # 配信用の絶対ドメイン名 (例: rust-snacks.pages.dev)
```

---

## AI 記事生成パイプラインの動作

Cron Trigger または Queue メッセージによって、以下の流れで段階的に非同期実行されます。

1. **candidate_collection**: GitHub Search API でスター数等の条件を満たすRustリポジトリ候補を収集し、D1に一時保存。
2. **repository_selection**: D1から「現在進行中かつ未完の連載（`series_index < series_total`）」があるリポジトリを最優先で選定。無い場合は、収集されたリポジトリからスコアリング（スター・フォーク・更新頻度等）を元に自動選定。
3. **snapshot**: 選定リポジトリのREADME、Cargo.toml、主要コード（`lib.rs`/`main.rs`）を取得し、制限サイズ内に切り詰めてR2およびD1にスナップショットとして保存。
4. **article_generation**: スナップショットのファイルをLLM (デフォルト: Gemini 1.5 Flash) に入力し、解析と記事執筆を行います。
   - 3000文字以内、Tips最大5個、Mermaid図最大3個の制約を厳守。
   - 連載継続時は前回の解説タイトルと要約をコンテキストにインジェクトし、Part N+1 として自動継続。
   - 品質ゲート (Quality Gate) を自動検証し、合格すれば `published` として即時公開、不合格なら `needs_review` として下書き保存。

---

## 運用方法

### 記事の公開 / 非公開の切り替え方法
公開された記事を非公開にする、または差し戻す場合は、D1データベースのステータスを変更し、R2のキャッシュを削除（または無効化）します。

#### 非公開（下書き・非公開）にする場合：
1. D1 で該当記事の `status` を変更します。
```bash
npx wrangler d1 execute rust-snacks-db --remote --command="UPDATE articles SET status = 'unpublished' WHERE slug = 'your-article-slug';"
```
2. R2から静的キャッシュHTMLを削除します。
```bash
npx wrangler r2 object delete rust-snacks-bucket articles/your-article-slug.html
# インデックス/RSS/Sitemapも自動再生成させるために削除
npx wrangler r2 object delete rust-snacks-bucket index.html
npx wrangler r2 object delete rust-snacks-bucket rss.xml
npx wrangler r2 object delete rust-snacks-bucket sitemap.xml
```

これにより、該当記事のURLは404エラー（または動的フォールバックでも非公開検知）となり、トップページの一覧やRSS/サイトマップからも自動で除外されます。

#### キャッシュ削除後の自動生成タイミングについて
R2から削除された `index.html`, `rss.xml`, `sitemap.xml` は、**「削除された後に最初のアクセス（GETリクエスト）があったタイミング」**でオンデマンドに自動再生成されます。

- **新規記事の公開時**: 配信パイプライン内でR2キャッシュが自動削除されます。
- **手動での非公開化時**: 上記コマンドで手動削除します。
- **再生成フロー**: アクセス時にR2にファイルが存在しないことを検知すると、D1から最新の公開済みデータを取得してHTML/XMLを再レンダリングし、R2にキャッシュを保存しつつレスポンスを返します。

---

### 記事生成の手動起動方法
日次の Cron Trigger を待たずに手動でパイプラインを起動するためのセキュアなエンドポイント（`POST /api/jobs/trigger`）が用意されています。

#### 1. 管理キー (ADMIN_API_KEY) の登録
本番環境で起動できるように、管理キーを登録しておきます。
```bash
npx wrangler secret put ADMIN_API_KEY
# 任意のトークンを入力して登録します
```

#### 2. curl による手動実行コマンド

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

