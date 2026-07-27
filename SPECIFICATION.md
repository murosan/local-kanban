# ローカルファーストAIネイティブ・カンバンツール「LocalKanban (仮)」基本・詳細仕様書

* **文書バージョン:** 2.2.0 (シンプルWebサーバー構成版)
* **更新日:** 2026-07-28
* **ステータス:** 承認済み / アーキテクチャ簡略化

---

## 1. システム概要 & コンセプト

`LocalKanban` は、ローカルのMarkdownファイル群をマスタデータ（SSOT: Single Source of Truth）とし、AIエージェント（MCP: Model Context Protocol）やOS・外部ツールとの高度な連携を備えた、開発者向けの超高速タスク管理ツールです。

本仕様では、開発・保守コストとシステムのシンプルさを最大化するため、**「シンプルなGo Local Webサーバー ＋ React SPA (リロードボタン同期)」** の構成を採用します。

```
 +-----------------------------------------------------------------------+
 |                         LocalKanban Web UI                            |
 |           (React 18+ / Tailwind CSS / dnd-kit / Vite SPA)             |
 |             Access via http://127.0.0.1:3737 (Reload Button)           |
 +-----------------------------------------------------------------------+
        |  Pure REST API (GET / POST / PUT / DELETE)                    ^
        v                                                               |
 +-----------------------------------------------------------------------+
 |                        Go Local Web Server                            |
 |  +--------------------+  +--------------------+  +------------------+ |
 |  |  File Sync Engine  |  |   Search Engine    |  |    MCP Server    | |
 |  |     (fsnotify)     |  | (SQLite FTS5 + rg) |  |   (stdio / SSE)  | |
 |  +--------------------+  +--------------------+  +------------------+ |
 +-----------------------------------------------------------------------+
        |                       |                       |
        v                       v                       v
 +---------------+      +---------------+      +------------------+
 |  Local Files  |      | SQLite Cache  |      | AI Clients       |
 |  (*.md files) |      | (local.db)    |      | (Cursor, Claude) |
 +---------------+      +---------------+      +------------------+
```

### 1.1. コアバリュー

1. **Zero Lock-in (完全オープンフォーマット):**
   * ベンダーロックインを一切排除。データ構造は汎用的な標準Markdown（YAML Frontmatter + Markdown Body）。
   * Gitによるバージョン管理やDIFFの確認、エディタ（VSCode, Obsidian, Neovim等）での直接書き換えが自由自在。
2. **AI-Native (AIエージェントによるネイティブ操作):**
   * Model Context Protocol (MCP) サーバーをアプリ内に標準実装（stdio および HTTP/SSE 双方に対応）。
   * Cursor, Claude Desktop, Auto-GPT等のAIツールが直接カンバンボードのタスクを参照・追加・ステータス更新可能。
3. **Simple & Robust (超シンプル・高堅牢):**
   * WebSocketなどの常時接続・複雑なステート管理を排除し、純粋なREST APIと手動リロード / ウインドウフォーカス時自動更新で動作。
   * OS上の `ripgrep` (`rg`) 連携による数万行規模のテキスト高速検索。

---

## 2. アーキテクチャ & 技術スタック

### 2.1. 構成フレームワーク

| 領域 | 採用技術 | 選定理由・目的 |
| :--- | :--- | :--- |
| **Backend Server** | **Go 1.22+ (net/http or Chi)** | 軽量・爆速なWebサーバー。CGO非依存（純粋Go SQLiteドライバ使用）でポータビリティ最高。 |
| **Frontend UI** | **React 18+ / Vite / TypeScript** | 高速なHMRと型安全性。静的ファイルとしてGoサーバー内に埋め込み可能 (`embed.FS`)。 |
| **Drag & Drop** | **dnd-kit** | アクセシビリティ対応かつパフォーマンスに優れた順序変更D&Dライブラリ。 |
| **Styling** | **Tailwind CSS v3+** | ディープダークモード対応、モダンで洗練されたGlassmorphism UIの構築。 |
| **Sync Mechanism** | **REST API + Reload Button** | UI上のリロードボタン、およびブラウザのウィンドウフォーカス時 (`window.onfocus`) に自動再取得。 |
| **Search & Cache** | **SQLite3 (FTS5) + ripgrep (`rg`)** | 構造化データの高速フィルタリングおよび全文検索。`rg`コマンドはOS環境に存在する場合は優先利用し、非存在時はSQLite FTS5へフォールバック。 |

---

## 3. データ構造 & ファイル仕様

### 3.1. マスタデータ (Markdownファイル構造)

* **格納先:** ユーザーが指定した任意ローカルディレクトリ（例: `~/my-kanban/` やプロジェクト直下の `.kanban/`）。
* **ファイル名:** `YYYYMMDD_HHMMSS_[slug].md` または `[UUID].md` （衝突を防ぐユニーク識別子）。
* **データ形式:** YAML Frontmatter + Markdown Body

#### 構造例 (`tasks/20260728_c8f39b1a.md`)

```markdown
---
id: "c8f39b1a-4d2e-4a6b-9c8d-1e2f3a4b5c6d"
title: "バックエンドの認証ロジック実装"
status: "In Progress"
rank: "0|i00008:"
tags:
  - "backend"
  - "go"
  - "auth"
assignee: "developer"
created_at: 2026-07-28T19:00:00Z
updated_at: 2026-07-28T19:30:00Z
slack_links:
  - "https://myworkspace.slack.com/archives/C0123456/p1625841000000"
---

## タスク詳細
- [ ] JWTの検証ミドルウェアの作成
- [ ] クッキーベースへの移行検証

### 備考・Slackスレッドのサマリー
APIの認可エラーが出る件について、チーム内での疎通確認が必要。
```

### 3.2. LexoRank 並び替えアルゴリズム

カードの順序制御には **LexoRank** を採用します。

* **原理:** 各カードに文字列型の `rank`（例: `"0|i00001:"`, `"0|i00008:"`）を割り当て、アルファベット順比較で昇順ソート。
* **メリット:** カードをAとBの間に移動する際、他の全てのカードの`rank`を更新する必要がなく、移動対象の1ファイルの`rank`のみをAとBの中間文字列に計算・更新するだけで済む（バルク書き込みゼロ）。

### 3.3. SQLite キャッシュデータベース構造 (`.local_cache.db`)

アプリケーション起動時およびファイル更新時に高速アクセス・検索用インデックスとしてSQLiteへ非同期同期されます。

```sql
-- タスクテーブル
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    rank TEXT NOT NULL,
    tags TEXT,             -- JSON配列文字列 e.g. '["backend","go"]'
    assignee TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    file_path TEXT UNIQUE NOT NULL,
    slack_links TEXT       -- JSON配列文字列
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_status_rank ON tasks(status, rank);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

-- 全文検索用 FTS5 テーブル
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    tokenize = 'unicode61'
);
```

---

## 4. 機能要件詳細

### 4.1. カンバンボード画面（メインUI / PWA）

1. **動的リスト/カラム生成:**
   * 設定ファイル (`board.json` または `.kanban_config.yml`) で指定されたカラム（例: `Todo`, `In Progress`, `Review`, `Done`）に基づきボードを生成。
2. **スムーズなドラッグ＆ドロップ (dnd-kit):**
   * 同一カラム内での並び替え、カラム間での移動に対応。
3. **ヘッダーコントロール:**
   * 検索バー
   * **リロードボタン (`Reload / Sync`):** 押下時に `GET /api/tasks` を呼び出して最新データを取得・再描画。
   * 新規作成ボタン (`+ New Task`)
4. **PWA (Progressive Web App) 対応:**
   * Chrome/Safariから「アプリとしてインストール」可能。

### 4.2. ローカルファイル同期メカニズム

```
[External Editor (VSCode, etc.)] ---> Edit .md ---> File System
                                                         |
                                                  fsnotify (Go)
                                                         |
                                            Update SQLite Cache (Backend)
                                                         |
[User clicks Reload or Focuses Window] -----------------> Fetch REST API ---> UI Re-render
```

1. **バックエンド監視 (fsnotify):**
   * VSCode等で外部編集されたファイルは、Goの `fsnotify` がバックグラウンドで検知し、SQLiteキャッシュを自動更新。
2. **フロントエンド同期:**
   * 複雑なリアルタイム常時接続（WebSocket）は用いず、UIヘッダーの「リロードボタン」クリック時、またはウィンドウフォーカス時にREST API経由で再読み込み。

### 4.3. 高速検索 & インデックス機能

1. **リアルタイム複合検索 (FTS5 + SQLite):**
   * REST API (`GET /api/tasks?q=...`) 経由でSQLite FTS5の高速全文検索を提供。
2. **`ripgrep` パケット検索:**
   * OSに `rg` コマンドが存在する場合は `rg` を呼び出して横断検索。未存在時は SQLite FTS5 へフォールバック。

### 4.4. MCP (Model Context Protocol) サーバー機能

`LocalKanban` のGoバックエンドは独立したMCPサーバー機能を内蔵します。

#### MCP Connection Modes
1. **HTTP/SSE モード:** `http://127.0.0.1:3737/mcp/sse`
2. **stdio モード:** `localkanban mcp` コマンドでSTDIOパイプ接続

#### 定義される MCP Tools

| Tool 名 | 説明 | 引数 (Parameters) |
| :--- | :--- | :--- |
| `get_tasks` | 指定されたステータスやタグのタスク一覧を取得 | `status` (string, optional), `tag` (string, optional), `limit` (number) |
| `create_task` | 新規タスク（Markdownファイル）を作成 | `title` (string, required), `description` (string), `status` (string), `tags` (array of string) |
| `update_task_status` | 指定タスクのステータスとRankを更新 | `task_id` (string, required), `new_status` (string, required), `target_rank` (string, optional) |
| `search_tasks_fts` | SQLite FTS5を利用したキーワード検索 | `query` (string, required) |

### 4.5. CLI & Slack 外部インテグレーション

1. **CLI コマンド:**
   * `localkanban start` : サーバーの起動
   * `localkanban add "タスクタイトル"` : CLIからの超高速タスク追加
2. **Slack Link Unfurling:**
   * Slack URLを自動検出してAPI経由でスレッド本文・発言者情報をキャッシュし、Web UI上にリッチ描画。

---

## 5. 開発フェーズ & ロードマップ

```mermaid
gantt
    title LocalKanban (シンプルWebサーバー版) 開発計画
    dateFormat  YYYY-MM-DD
    section Phase 1: Prototype
    Go REST API サーバー構築         :p1_1, 2026-08-01, 2d
    Markdown CRUD & React カンバン UI  :p1_2, after p1_1, 3d
    LexoRank & dnd-kit 統合          :p1_3, after p1_2, 2d
    section Phase 2: Performance
    fsnotify キャッシュ自動更新      :p2_1, 2026-08-08, 2d
    SQLite FTS5 キャッシュ実装       :p2_2, after p2_1, 3d
    ripgrep (OS / FTS5) 検索統合     :p2_3, after p2_2, 2d
    section Phase 3: AI & CLI Integrations
    MCP SSE/stdio サーバー実装       :p3_1, 2026-08-15, 4d
    CLI ツール連携 (localkanban add)  :p3_2, after p3_1, 2d
    Slack Link Unfurling & PWA化     :p3_3, after p3_2, 3d
```

---

## 6. 非機能要件 & 品質基準

* **極限のシンプルさ:**
  * 接続状態の管理が不要でエラーが起きにくく、実装・デバッグ・動作テストが非常に容易。
* **ポータビリティ:**
  * Goの `go:embed` を使用し、ビルド後のWebフロントエンド資産（Reactビルド成果物）を単一のGo実行可能バイナリにパッケージング。
