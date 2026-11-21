.PHONY: all build up down fmt lint check test backend-lint frontend-lint frontend-fmt

all: check

up:
	docker compose up -d --build

down:
	docker compose down

fmt:
	docker compose exec backend golangci-lint run --fix
	docker compose exec frontend npm run check:fix

lint:
	docker compose exec backend golangci-lint run
	docker compose exec frontend npm run check

check: lint
	docker compose exec backend go test ./...
	docker compose exec frontend npm run build
