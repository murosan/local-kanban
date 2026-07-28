package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"localkanban/pkg/api"
	"localkanban/pkg/markdown"
	"localkanban/pkg/model"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3737"
	}

	tasksDir := os.Getenv("TASKS_DIR")
	if tasksDir == "" {
		tasksDir = "./tasks"
	}

	store, err := markdown.NewStore(tasksDir)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	// Create initial sample task if store is empty
	tasks, err := store.GetAllTasks()
	if err == nil && len(tasks) == 0 {
		createSampleTasks(store)
	}

	server := api.NewServer(store)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// Add CORS middleware
	handler := corsMiddleware(mux)

	addr := fmt.Sprintf("0.0.0.0:%s", port)
	log.Printf("LocalKanban Server running on http://127.0.0.1:%s (TASKS_DIR=%s)", port, tasksDir)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
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

