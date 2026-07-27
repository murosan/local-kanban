# Development Environment Instructions

開発は全てDocker上で行っています。GoやNode.jsコマンド（ビルド、テスト、パッケージ追加等）は全て `docker compose exec` または `docker compose run` でコンテナ内から実行してください。

例:
- Goテスト: `docker compose exec backend go test ./...`
- Frontendビルド: `docker compose exec frontend npm run build`
