package search

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/murosan/local-kanban/pkg/cache"
	"github.com/murosan/local-kanban/pkg/model"
)

func TestSearchEngine(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "kanban_search_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	dbPath := filepath.Join(tmpDir, "test.db")
	c, err := cache.NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer func() { _ = c.Close() }()

	task := &model.Task{
		ID:        "task-unique-123",
		Title:     "SQLite FTS5 検索テストタスク",
		ColumnID:  "col-todo",
		Rank:      "0|h",
		Tags:      []string{"search"},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
		FilePath:  filepath.Join(tmpDir, "task1.md"),
		Content:   "## 詳細\nこのタスクは SQLite FTS5 と LIKE 検索の動作確認用です。",
		CustomFields: []model.CustomFieldValue{
			{
				ID:      "cf-assignee",
				Name:    "担当者",
				Type:    model.FieldTypeText,
				Value:   "田中花子",
				Enabled: true,
			},
			{
				ID:      "cf-priority",
				Name:    "優先度",
				Type:    model.FieldTypeDropdown,
				Value:   "高",
				Options: []model.CustomFieldOption{{ID: "o1", Value: "高"}, {ID: "o2", Value: "低"}},
				Enabled: true,
			},
		},
	}
	if err := c.UpsertTask(task); err != nil {
		t.Fatalf("failed to upsert task: %v", err)
	}

	engine := NewEngine(c)

	// Test Search with keyword
	ids, err := engine.Search("FTS5")
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(ids) == 0 || ids[0] != "task-unique-123" {
		t.Errorf("expected ['task-unique-123'] for 'FTS5', got %v", ids)
	}

	// Test Search with Japanese short query (LIKE fallback)
	idsShort, err := engine.Search("検索")
	if err != nil {
		t.Fatalf("search failed for short Japanese query: %v", err)
	}
	if len(idsShort) == 0 || idsShort[0] != "task-unique-123" {
		t.Errorf("expected ['task-unique-123'] for '検索', got %v", idsShort)
	}

	// Test Search matching custom field value (FTS5)
	idsCF, err := engine.Search("田中花子")
	if err != nil {
		t.Fatalf("search failed for custom field query: %v", err)
	}
	if len(idsCF) != 1 || idsCF[0] != "task-unique-123" {
		t.Errorf("expected ['task-unique-123'] for '田中花子', got %v", idsCF)
	}

	// Test Search matching short custom field value (LIKE fallback)
	idsCFShort, err := engine.Search("高")
	if err != nil {
		t.Fatalf("search failed for short custom field query: %v", err)
	}
	if len(idsCFShort) != 1 || idsCFShort[0] != "task-unique-123" {
		t.Errorf("expected ['task-unique-123'] for '高', got %v", idsCFShort)
	}
}
