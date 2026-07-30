package cache

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/murosan/local-kanban/pkg/model"
)

func TestSQLiteCache(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "kanban_cache_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	dbPath := filepath.Join(tmpDir, "test.db")
	cache, err := NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("failed to init SQLiteCache: %v", err)
	}
	defer func() { _ = cache.Close() }()

	task1 := &model.Task{
		ID:        "task-1",
		Title:     "認証ミドルウェアの実装",
		ColumnID:  "col-todo",
		Rank:      "0|i00001:",
		Tags:      []string{"backend", "go"},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
		FilePath:  "/tmp/task-1.md",
		Content:   "JWT認証ロジックをテストします。",
	}

	task2 := &model.Task{
		ID:        "task-2",
		Title:     "dnd-kit のドラッグ＆ドロップ調整",
		ColumnID:  "col-in-progress",
		Rank:      "0|i00002:",
		Tags:      []string{"frontend", "react"},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
		FilePath:  "/tmp/task-2.md",
		Content:   "LexoRank順序並び替えの動作検証",
	}

	// Test Upsert
	if err := cache.UpsertTask(task1); err != nil {
		t.Fatalf("failed to upsert task1: %v", err)
	}
	if err := cache.UpsertTask(task2); err != nil {
		t.Fatalf("failed to upsert task2: %v", err)
	}

	// Test Search FTS
	results, err := cache.SearchFTS("認証")
	if err != nil {
		t.Fatalf("failed to search fts: %v", err)
	}
	if len(results) != 1 || results[0] != "task-1" {
		t.Errorf("expected ['task-1'], got %v", results)
	}

	resultsContent, err := cache.SearchFTS("LexoRank")
	if err != nil {
		t.Fatalf("failed to search fts for content: %v", err)
	}
	if len(resultsContent) != 1 || resultsContent[0] != "task-2" {
		t.Errorf("expected ['task-2'], got %v", resultsContent)
	}

	// Test Delete
	if err := cache.DeleteTask("task-1"); err != nil {
		t.Fatalf("failed to delete task1: %v", err)
	}

	resultsAfterDelete, err := cache.SearchFTS("認証")
	if err != nil {
		t.Fatalf("failed to search after delete: %v", err)
	}
	if len(resultsAfterDelete) != 0 {
		t.Errorf("expected 0 results after delete, got %v", resultsAfterDelete)
	}
}
