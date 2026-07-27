# プロジェクト開発・実行ルール

## 1. コマンド実行環境
本プロジェクトの開発・ビルド・テスト環境はすべて Docker で統一されています。
Go や Node.js 関連のコマンド（ビルド、テスト、パッケージ追加、型チェック等）を実行する際は、ローカル環境で直接実行するのではなく、必ず `docker compose exec` または `docker compose run` を使用してコンテナ内で実行してください。

### コマンド実行例
- **Go テスト**: `docker compose exec backend go test ./...`
- **Frontend ビルド**: `docker compose exec frontend npm run build`
- **パッケージインストール**: `docker compose exec frontend npm install <package>`
