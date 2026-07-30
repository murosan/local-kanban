# LocalKanban

ローカルのMarkdownファイルをマスタデータ（SSOT）として管理する、超高速・ローカルファーストなAIネイティブ・カンバンツール。

---

## 🚀 開発環境の起動 (Docker Compose)

`docker compose up` で開発環境（Go 1.26 バックエンド + React Vite フロントエンド）を起動できます。フロントエンド開発サーバー (ポート 5173) は HMR (ホットモジュールリロード) に対応しています。

```bash
# 開発環境の起動
docker compose up --build

# 停止
docker compose down
```

- **Web UI & API Server:** [http://localhost:3737](http://localhost:3737)
- **Frontend Dev Server (Vite HMR):** [http://localhost:5173](http://localhost:5173)

---

## 🧹 コード品質・フォーマット・リンター (Docker 経由)

本プロジェクトのコマンド実行はすべて Docker コンテナ経由で統一されています。

- **Go (バックエンド):** `golangci-lint` (v2) および `gofmt` (`golangci-lint` 経由)
- **TypeScript / React (フロントエンド):** `ESLint` (Flat Config) および `Prettier`

### 実行コマンド (`Makefile`)

```bash
# フォーマット実行 (Go: golangci-lint run --fix / Frontend: prettier --write)
make fmt

# リンター実行 (Go: golangci-lint run / Frontend: eslint)
make lint

# フォーマットチェック・静的解析・テスト・ビルドを一括実行
make check
```

または Docker コマンドを直接実行:

```bash
# バックエンド
docker compose exec backend golangci-lint run --fix   # フォーマット＆自動修正
docker compose exec backend golangci-lint run         # リンターチェック
docker compose exec backend go test ./...             # テスト実行

# フロントエンド
docker compose exec frontend npm run format          # フォーマット実行
docker compose exec frontend npm run format:check    # フォーマットチェック
docker compose exec frontend npm run lint            # リンターチェック
docker compose exec frontend npm run build           # ビルド
```

---

## 📦 プロダクション統合コンテナのビルド・起動

Web UI (React SPA) を自動ビルドし、単一の Go バイナリとして組み込んだ軽量プロダクションコンテナを起動する場合：

```bash
# マルチステージビルドによる統合コンテナの起動
docker compose -f docker-compose.prod.yml up --build -d

# 停止
docker compose -f docker-compose.prod.yml down
```

- **Web UI & API Server:** [http://localhost:3737](http://localhost:3737) (単一コンテナで稼働)

---

## 🤖 MCP (Model Context Protocol) サーバー連携

LocalKanban は MCP サーバー機能を内蔵しており、Cursor, Claude Desktop, MCP Inspector 等の AI エージェントからカンバンタスクを直接操作・検索・作成できます。

### 接続 URL / コマンド

| 接続モード            | 接続先 / コマンド               | 説明                            |
| :-------------------- | :------------------------------ | :------------------------------ |
| **HTTP / SSE モード** | `http://localhost:3737/mcp/sse` | Web API サーバー経由の SSE 接続 |
| **STDIO モード**      | `localkanban mcp`               | 標準入出力 (STDIO) パイプ接続   |

#### Claude Desktop (`claude_desktop_config.json`) 設定例:

```json
{
  "mcpServers": {
    "localkanban": {
      "command": "docker",
      "args": ["compose", "exec", "-i", "backend", "./localkanban", "mcp"]
    }
  }
}
```

#### MCP Inspector テスト方法:

```bash
npx @modelcontextprotocol/inspector
```

- **Transport Type:** `SSE`
- **URL:** `http://localhost:3737/mcp/sse`

### 提供される MCP Tools

| Tool 名              | 説明                           | 引数 (Parameters)                                                                                      |
| :------------------- | :----------------------------- | :----------------------------------------------------------------------------------------------------- |
| `get_tasks`          | タスク一覧の取得               | `status` (string, optional), `tag` (string, optional), `limit` (number)                                |
| `create_task`        | 新規タスク (Markdown) の作成   | `title` (string, required), `description` (string), `status` (string), `tags` (array of string)        |
| `update_task`        | タスクの包括的プロパティ更新   | `task_id` (string, required), `title`, `description`, `status`, `tags`, `target_rank`, `custom_fields` |
| `update_task_status` | タスクのステータス・順序更新   | `task_id` (string, required), `new_status` (string, required), `target_rank` (string)                  |
| `search_tasks_fts`   | SQLite FTS5 による高速全文検索 | `query` (string, required)                                                                             |

---

## 💻 CLI ツール (`localkanban`) の使い方

`localkanban` 単一バイナリから各種サブコマンドを実行可能です。

```bash
# Web UI および REST API サーバーの起動
localkanban start --port 3737 --tasks-dir ./tasks

# CLIからの高速タスク追加
localkanban add "バックエンド認証機能の実装" --status col-todo --tags "backend,go" --desc "JWT検証ミドルウェアの作成"

# MCP STDIO サーバーの起動
localkanban mcp --tasks-dir ./tasks

# ヘルプ表示
localkanban help
```

---

## 📱 PWA (Progressive Web App) 対応

Chrome や Safari から「アプリとしてインストール」してスタンドアロンウィンドウでカンバンを起動可能です。オフライン時のアプリシェルキャッシュにも対応しています。

---

## 🛠 設定・環境変数

| 環境変数    | 初期値       | 説明                     |
| :---------- | :----------- | :----------------------- |
| `PORT`      | `3737`       | ポート番号               |
| `HOST`      | `0.0.0.0`    | バインドホスト           |
| `TASKS_DIR` | `/app/tasks` | Markdownファイルの保存先 |

---

## 📡 REST API エンドポイント

- `GET /api/tasks` - タスク一覧取得 (クエリ `?q=...` で SQLite FTS5 全文検索)
- `POST /api/tasks` - タスク作成
- `PUT /api/tasks/{id}` - タスク更新
- `DELETE /api/tasks/{id}` - タスク削除
- `GET /api/config` / `PUT /api/config` - ボード・カラム・テーマ設定
- `GET /mcp/sse` - MCP (Model Context Protocol) SSE エンドポイント

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) のもとで公開されています。
