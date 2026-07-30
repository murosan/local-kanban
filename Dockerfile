# ==========================================
# Stage 1: Build Frontend React SPA
# ==========================================
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Go Backend with embedded UI
# ==========================================
FROM golang:1.26-alpine AS backend-builder
WORKDIR /app

ARG GOOS=linux
ARG GOARCH

RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
COPY --from=frontend-builder /app/pkg/ui/dist ./pkg/ui/dist

RUN CGO_ENABLED=0 GOOS=${GOOS} ${GOARCH:+GOARCH=${GOARCH}} go build -ldflags="-s -w" -o /app/localkanban ./cmd/localkanban

# ==========================================
# Stage 3: Minimal Production Runtime
# ==========================================
FROM alpine:3.20
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=backend-builder /app/localkanban /app/localkanban

EXPOSE 3737

ENV PORT=3737
ENV HOST=0.0.0.0
ENV TASKS_DIR=/app/tasks

VOLUME ["/app/tasks"]

CMD ["/app/localkanban"]
