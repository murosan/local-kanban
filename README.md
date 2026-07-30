# LocalKanban

ローカルのMarkdownファイルをマスタデータとして管理する、シンプルで高速なAIネイティブ・カンバンツール。

## 🚀 開発環境の起動 (Docker Compose)

`docker compose up` で開発環境（Go 1.26 バックエンド + React Vite フロントエンド）を起動できます。ホットリロードに対応しています。

```bash
# 開発環境の起動
docker compose up --build

# 停止
docker compose down
```

- **Frontend Dev Server:** [http://localhost:5173](http://localhost:5173)
- **Backend API Server:** [http://localhost:3737](http://localhost:3737)

---

## 📦 プロダクション統合コンテナの起動 (単一バイナリ埋め込み)

Web UI が Go バイナリ内に埋め込まれたプロダクション用統合コンテナを起動する場合：

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

- **Web UI & API Server:** [http://localhost:3737](http://localhost:3737)

---

## 🛠 設定・環境変数

| 環境変数 | 初期値 | 説明 |
| :--- | :--- | :--- |
| `PORT` | `3737` | ポート番号 |
| `HOST` | `0.0.0.0` | バインドホスト |
| `TASKS_DIR` | `/app/tasks` | Markdownファイルの保存先 |

---

## 📡 主な API エンドポイント

- `GET /api/tasks` - タスク一覧取得
- `POST /api/tasks` - タスク作成
- `PUT /api/tasks/{id}` - タスク更新
- `DELETE /api/tasks/{id}` - タスク削除
- `GET /api/config` / `PUT /api/config` - ボード・カラム設定
