package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"path/filepath"

	"github.com/go-chi/cors"

	"localkanban/pkg/api"
	"localkanban/pkg/cache"
	"localkanban/pkg/markdown"
	"localkanban/pkg/model"
	"localkanban/pkg/search"
	"localkanban/pkg/ui"
)

type config struct {
	host     string
	port     string
	tasksDir string
}

func parseConfig(args []string) (*config, error) {
	fs := flag.NewFlagSet("server", flag.ContinueOnError)

	defaultHost := os.Getenv("HOST")
	if defaultHost == "" {
		defaultHost = "127.0.0.1"
	}

	defaultPort := os.Getenv("PORT")
	if defaultPort == "" {
		defaultPort = "3737"
	}

	defaultTasksDir := os.Getenv("TASKS_DIR")
	if defaultTasksDir == "" {
		defaultTasksDir = "./tasks"
	}

	host := fs.String("host", defaultHost, "Host address to listen on (e.g. 127.0.0.1, localhost, 0.0.0.0)")
	port := fs.String("port", defaultPort, "Port number to listen on")
	tasksDir := fs.String("tasks-dir", defaultTasksDir, "Directory to store task markdown files")

	if err := fs.Parse(args); err != nil {
		return nil, err
	}

	return &config{
		host:     *host,
		port:     *port,
		tasksDir: *tasksDir,
	}, nil
}

func main() {
	cfg, err := parseConfig(os.Args[1:])
	if err != nil {
		log.Fatalf("Failed to parse config: %v", err)
	}

	store, err := markdown.NewStore(cfg.tasksDir)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	// Initialize SQLite Cache and Search Engine
	dbPath := filepath.Join(cfg.tasksDir, ".local_cache.db")
	sqliteCache, err := cache.NewSQLiteCache(dbPath)
	if err != nil {
		log.Printf("Warning: Failed to initialize SQLite Cache at %s: %v", dbPath, err)
	} else {
		defer sqliteCache.Close()
		store.SetCache(sqliteCache)
	}

	// Create initial sample task if store is empty
	tasks, err := store.GetAllTasks()
	if err == nil && len(tasks) == 0 {
		createSampleTasks(store)
	}

	if sqliteCache != nil {
		if err := store.SyncCache(); err != nil {
			log.Printf("Warning: Failed to sync cache on startup: %v", err)
		}
	}

	searchEngine := search.NewEngine(sqliteCache)
	log.Printf("Search Engine: SQLite FTS5 + LIKE hybrid search enabled")

	server := api.NewServer(store, searchEngine)

	mux := http.NewServeMux()
	server.RegisterRoutes(mux)
	mux.Handle("/", ui.Handler())

	// Add CORS middleware using chi's cors package
	corsMiddleware := cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	})
	handler := corsMiddleware(mux)

	addr := fmt.Sprintf("%s:%s", cfg.host, cfg.port)
	log.Printf("LocalKanban Server running on http://%s:%s (TASKS_DIR=%s)", cfg.host, cfg.port, cfg.tasksDir)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}

func createSampleTasks(store *markdown.Store) {
	samples := []*model.Task{
		{
			Title:    "LocalKanban Phase 1プロトタイプ動作確認",
			ColumnID: "col-todo",
			Rank:     "0|m",
			Tags:     []string{"frontend", "backend"},
			Content:  "## 実装確認リスト\n- [x] Go Webサーバー\n- [ ] React UI dnd-kit\n- [ ] Focus / Reload 同期",
		},
		{
			Title:    "dnd-kit によるカンバンカード並び替え実装",
			ColumnID: "col-in-progress",
			Rank:     "0|m",
			Tags:     []string{"dnd-kit", "react"},
			Content:  "LexoRankアルゴリズムと連携した並び替えドラッグ＆ドロップ",
		},
		{
			Title:    "Docker Compose 構成の定義",
			ColumnID: "col-done",
			Rank:     "0|m",
			Tags:     []string{"docker", "infra"},
			Content:  "Go 1.26 と Node.js 24 による開発環境のコンテナ化",
		},
	}

	for _, sample := range samples {
		_ = store.SaveTask(sample)
	}
}

