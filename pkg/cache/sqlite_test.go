package cache

import (
	"database/sql"
	"encoding/json"
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

	// Test GetTaskByID
	fetched1, err := cache.GetTaskByID("task-1")
	if err != nil {
		t.Fatalf("failed to get task-1 by id: %v", err)
	}
	if fetched1.Title != "認証ミドルウェアの実装" {
		t.Errorf("expected title '認証ミドルウェアの実装', got %q", fetched1.Title)
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

func TestTagsCache(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "kanban_tags_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	dbPath := filepath.Join(tmpDir, "tags_test.db")
	cache, err := NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("failed to init SQLiteCache: %v", err)
	}
	defer func() { _ = cache.Close() }()

	now := time.Now().UTC()
	t1Time := now.Add(-10 * time.Minute)
	t2Time := now.Add(-5 * time.Minute)
	t3Time := now

	task1 := &model.Task{
		ID:        "task-1",
		Title:     "Old task",
		ColumnID:  "col-todo",
		Rank:      "0|a",
		Tags:      []string{"old-tag", "shared-tag"},
		CreatedAt: t1Time,
		UpdatedAt: t1Time,
		FilePath:  "/tmp/task-1.md",
	}

	task2 := &model.Task{
		ID:        "task-2",
		Title:     "Medium task",
		ColumnID:  "col-todo",
		Rank:      "0|b",
		Tags:      []string{"medium-tag", "shared-tag"},
		CreatedAt: t2Time,
		UpdatedAt: t2Time,
		FilePath:  "/tmp/task-2.md",
	}

	if err := cache.UpsertTask(task1); err != nil {
		t.Fatalf("failed to upsert task1: %v", err)
	}
	if err := cache.UpsertTask(task2); err != nil {
		t.Fatalf("failed to upsert task2: %v", err)
	}

	// 1. Check GetAllTags order (shared-tag updated at t2Time, medium-tag at t2Time, old-tag at t1Time)
	tags, err := cache.GetAllTags()
	if err != nil {
		t.Fatalf("failed to GetAllTags: %v", err)
	}
	if len(tags) != 3 {
		t.Fatalf("expected 3 tags, got %d: %v", len(tags), tags)
	}
	// 'medium-tag' and 'shared-tag' both have t2Time, alphabetical ties resolved by name ASC
	// 'old-tag' has t1Time (oldest) so must be last
	if tags[2] != "old-tag" {
		t.Errorf("expected last tag to be 'old-tag', got %s", tags[2])
	}

	// 2. Update task1 to t3Time (newest) with 'new-tag' and 'old-tag'
	task1Updated := &model.Task{
		ID:        "task-1",
		Title:     "Updated task",
		ColumnID:  "col-todo",
		Rank:      "0|a",
		Tags:      []string{"new-tag", "old-tag"},
		CreatedAt: t1Time,
		UpdatedAt: t3Time,
		FilePath:  "/tmp/task-1.md",
	}
	if err := cache.UpsertTask(task1Updated); err != nil {
		t.Fatalf("failed to update task1: %v", err)
	}

	tagsAfterUpdate, err := cache.GetAllTags()
	if err != nil {
		t.Fatalf("failed to GetAllTags after update: %v", err)
	}
	// 'new-tag' and 'old-tag' now have t3Time, so they must be first
	topTwo := map[string]bool{tagsAfterUpdate[0]: true, tagsAfterUpdate[1]: true}
	if !topTwo["new-tag"] || !topTwo["old-tag"] {
		t.Errorf("expected top two tags to be 'new-tag' and 'old-tag', got %v", tagsAfterUpdate)
	}

	// 3. Test SyncAll rebuilds tags table properly from active tasks
	allTasks := []*model.Task{
		{
			ID:        "task-a",
			Title:     "Task A",
			ColumnID:  "col-todo",
			Rank:      "0|a",
			Tags:      []string{"synced-a", "shared"},
			CreatedAt: t1Time,
			UpdatedAt: t1Time,
			FilePath:  "/tmp/a.md",
		},
		{
			ID:        "task-b",
			Title:     "Task B",
			ColumnID:  "col-todo",
			Rank:      "0|b",
			Tags:      []string{"synced-b", "shared"},
			CreatedAt: t3Time,
			UpdatedAt: t3Time,
			FilePath:  "/tmp/b.md",
		},
	}
	if err := cache.SyncAll(allTasks); err != nil {
		t.Fatalf("failed to SyncAll: %v", err)
	}

	tagsAfterSync, err := cache.GetAllTags()
	if err != nil {
		t.Fatalf("failed to GetAllTags after SyncAll: %v", err)
	}
	if len(tagsAfterSync) != 3 {
		t.Fatalf("expected 3 tags after sync, got %d: %v", len(tagsAfterSync), tagsAfterSync)
	}
	// 'shared' has max(t1Time, t3Time) = t3Time
	// 'synced-b' has t3Time
	// 'synced-a' has t1Time (should be last)
	if tagsAfterSync[2] != "synced-a" {
		t.Errorf("expected last tag to be 'synced-a', got %s", tagsAfterSync[2])
	}
}

func TestSubtasksCache(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "kanban_subtasks_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	dbPath := filepath.Join(tmpDir, "subtasks_test.db")
	cache, err := NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("failed to init SQLiteCache: %v", err)
	}
	defer func() { _ = cache.Close() }()

	now := time.Now().UTC()
	parent := &model.Task{
		ID:       "parent-1",
		Title:    "Parent Task",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Subtasks: []model.SubtaskRef{
			{ID: "sub-1", Completed: false},
			{ID: "sub-2", Completed: true},
		},
		CreatedAt: now,
		UpdatedAt: now,
		FilePath:  "/tmp/parent.md",
	}

	sub1 := &model.Task{
		ID:        "sub-1",
		ParentID:  "parent-1",
		Title:     "Subtask 1",
		ColumnID:  "col-todo",
		Rank:      "0|a",
		CreatedAt: now,
		UpdatedAt: now,
		FilePath:  "/tmp/sub1.md",
	}

	sub2 := &model.Task{
		ID:        "sub-2",
		ParentID:  "parent-1",
		Title:     "Subtask 2",
		ColumnID:  "col-done",
		Rank:      "0|b",
		CreatedAt: now,
		UpdatedAt: now,
		FilePath:  "/tmp/sub2.md",
	}

	if err := cache.UpsertTask(parent); err != nil {
		t.Fatalf("failed to upsert parent: %v", err)
	}
	if err := cache.UpsertTask(sub1); err != nil {
		t.Fatalf("failed to upsert sub1: %v", err)
	}
	if err := cache.UpsertTask(sub2); err != nil {
		t.Fatalf("failed to upsert sub2: %v", err)
	}

	subtasks, err := cache.GetSubtasksByParentID("parent-1")
	if err != nil {
		t.Fatalf("failed to get subtasks: %v", err)
	}
	if len(subtasks) != 2 {
		t.Fatalf("expected 2 subtasks, got %d", len(subtasks))
	}
	if subtasks[0].ID != "sub-1" || subtasks[0].ParentID != "parent-1" {
		t.Errorf("unexpected subtask 0: %+v", subtasks[0])
	}
	if subtasks[1].ID != "sub-2" || subtasks[1].ParentID != "parent-1" {
		t.Errorf("unexpected subtask 1: %+v", subtasks[1])
	}

	// Verify parent task has Subtasks correctly retrieved
	parentTasks, err := cache.GetTasksByColumnIDs([]string{"col-todo"})
	if err != nil {
		t.Fatalf("failed to get parent tasks: %v", err)
	}
	var foundParent *model.Task
	for _, pt := range parentTasks {
		if pt.ID == "parent-1" {
			foundParent = pt
			break
		}
	}
	if foundParent == nil {
		t.Fatalf("expected to find parent-1 in col-todo")
	}
	if len(foundParent.Subtasks) != 2 {
		t.Fatalf("expected parent to have 2 subtask refs, got %d", len(foundParent.Subtasks))
	}
	if foundParent.Subtasks[0].ID != "sub-1" || foundParent.Subtasks[0].Completed != false {
		t.Errorf("unexpected subtask ref 0: %+v", foundParent.Subtasks[0])
	}
	if foundParent.Subtasks[1].ID != "sub-2" || foundParent.Subtasks[1].Completed != true {
		t.Errorf("unexpected subtask ref 1: %+v", foundParent.Subtasks[1])
	}

	// Test GetTasksByColumnIDs retrieves parent_id correctly
	tasksInTodo, err := cache.GetTasksByColumnIDs([]string{"col-todo"})
	if err != nil {
		t.Fatalf("failed to get tasks by column: %v", err)
	}
	if len(tasksInTodo) != 2 {
		t.Fatalf("expected 2 tasks in col-todo, got %d", len(tasksInTodo))
	}
}

func TestSearchFTSCustomFields(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "cf_search_test.db")
	c, err := NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("failed to init SQLiteCache: %v", err)
	}
	defer func() { _ = c.Close() }()

	now := time.Now().UTC()
	task1 := &model.Task{
		ID:        "task-cf-1",
		Title:     "デザイン調整",
		ColumnID:  "col-todo",
		Rank:      "0|a",
		CreatedAt: now,
		UpdatedAt: now,
		FilePath:  "/tmp/cf-1.md",
		CustomFields: []model.CustomFieldValue{
			{
				ID:    "cf-1",
				Name:  "優先度",
				Type:  model.FieldTypeDropdown,
				Value: "高",
				Options: []model.CustomFieldOption{
					{ID: "opt-1", Value: "高", Color: "#ef4444"},
					{ID: "opt-2", Value: "低", Color: "#6366f1"},
				},
				Enabled: true,
			},
			{
				ID:      "cf-2",
				Name:    "期限",
				Type:    model.FieldTypeDate,
				Value:   "2026-08-28",
				Enabled: true,
			},
			{
				ID:      "cf-3",
				Name:    "リンク",
				Type:    model.FieldTypeLink,
				Value:   "https://example.com/design-doc",
				Enabled: true,
			},
			{
				ID:      "cf-4",
				Name:    "緊急フラグ",
				Type:    model.FieldTypeCheckbox,
				Value:   true,
				Enabled: true,
			},
			{
				ID:      "cf-5",
				Name:    "非表示メモ",
				Type:    model.FieldTypeText,
				Value:   "シークレットワード",
				Enabled: false,
			},
		},
	}

	task2 := &model.Task{
		ID:        "task-cf-2",
		Title:     "備品調達",
		ColumnID:  "col-todo",
		Rank:      "0|b",
		CreatedAt: now,
		UpdatedAt: now,
		FilePath:  "/tmp/cf-2.md",
		CustomFields: []model.CustomFieldValue{
			{
				ID:      "cf-6",
				Name:    "見積",
				Type:    model.FieldTypeNumber,
				Value:   "42",
				Enabled: true,
			},
			{
				ID:      "cf-7",
				Name:    "未チェック",
				Type:    model.FieldTypeCheckbox,
				Value:   false,
				Enabled: true,
			},
			{
				ID:   "cf-8",
				Name: "買い物リスト",
				Type: model.FieldTypeChecklist,
				Value: []any{
					map[string]any{"id": "item-1", "text": "牛乳", "completed": false},
					map[string]any{"id": "item-2", "text": "電動ドライバー", "completed": true},
				},
				Options: []model.CustomFieldOption{
					{ID: "opt-old", Value: "不要アイテム"},
				},
				Enabled: true,
			},
			{
				ID:   "cf-9",
				Name: "参考リンク",
				Type: model.FieldTypeLink,
				Value: []any{
					map[string]any{
						"id":    "link-1",
						"label": "調達カタログ",
						"url":   "https://example.com/catalog",
					},
					map[string]any{
						"id":  "link-2",
						"url": "https://example.com/vendor-portal",
					},
				},
				Enabled: true,
			},
		},
	}

	if err := c.UpsertTask(task1); err != nil {
		t.Fatalf("failed to upsert task1: %v", err)
	}
	if err := c.UpsertTask(task2); err != nil {
		t.Fatalf("failed to upsert task2: %v", err)
	}

	testCases := []struct {
		name    string
		query   string
		wantIDs []string
	}{
		{"dropdown short 1-char LIKE", "高", []string{"task-cf-1"}},
		{"dropdown field name FTS5", "優先度", []string{"task-cf-1"}},
		{"dropdown field name + value", "優先度 高", []string{"task-cf-1"}},
		{"dropdown field name + unselected value excluded", "優先度 低", nil},
		{"dropdown unselected option excluded", "低", nil},
		{"date full FTS5", "2026-08-28", []string{"task-cf-1"}},
		{"link URL FTS5", "https://example.com/design-doc", []string{"task-cf-1"}},
		{"checkbox true matches name", "緊急フラグ", []string{"task-cf-1"}},
		{"checkbox false excluded", "未チェック", nil},
		{"disabled field excluded", "シークレットワード", nil},
		{"number short 2-char LIKE", "42", []string{"task-cf-2"}},
		{"checklist short 2-char LIKE", "牛乳", []string{"task-cf-2"}},
		{"checklist long FTS5", "電動ドライバー", []string{"task-cf-2"}},
		{"checklist unselected options excluded", "不要アイテム", nil},
		{"link list label FTS5", "調達カタログ", []string{"task-cf-2"}},
		{"link list URL FTS5", "vendor-portal", []string{"task-cf-2"}},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := c.SearchFTS(tc.query)
			if err != nil {
				t.Fatalf("SearchFTS(%q) failed: %v", tc.query, err)
			}
			if len(got) != len(tc.wantIDs) {
				t.Fatalf("SearchFTS(%q): want %v, got %v", tc.query, tc.wantIDs, got)
			}
			for i := range tc.wantIDs {
				if got[i] != tc.wantIDs[i] {
					t.Errorf(
						"SearchFTS(%q)[%d]: want %q, got %q",
						tc.query,
						i,
						tc.wantIDs[i],
						got[i],
					)
				}
			}
		})
	}

	// Verify SyncAll preserves custom field indexing as well
	if err := c.SyncAll([]*model.Task{task1, task2}); err != nil {
		t.Fatalf("SyncAll failed: %v", err)
	}
	gotAfterSync, err := c.SearchFTS("電動ドライバー")
	if err != nil {
		t.Fatalf("SearchFTS after SyncAll failed: %v", err)
	}
	if len(gotAfterSync) != 1 || gotAfterSync[0] != "task-cf-2" {
		t.Errorf("expected ['task-cf-2'] after SyncAll, got %v", gotAfterSync)
	}
}

func TestLegacyTasksFTSMigration(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "legacy.db")

	// Create a legacy DB without parent_id/subtasks in tasks and without custom_fields in tasks_fts
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to open raw sqlite db: %v", err)
	}
	legacySchema := `
	CREATE TABLE tasks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		column_id TEXT NOT NULL,
		rank TEXT NOT NULL,
		tags TEXT,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		file_path TEXT UNIQUE NOT NULL,
		custom_fields TEXT,
		summary TEXT
	);
	CREATE VIRTUAL TABLE tasks_fts USING fts5(
		id UNINDEXED,
		title,
		content,
		tags,
		tokenize = 'trigram'
	);
	`
	if _, err := rawDB.Exec(legacySchema); err != nil {
		_ = rawDB.Close()
		t.Fatalf("failed to create legacy schema: %v", err)
	}

	cfJSON, _ := json.Marshal([]model.CustomFieldValue{
		{
			ID:      "cf-legacy",
			Name:    "担当者",
			Type:    model.FieldTypeText,
			Value:   "佐藤太郎",
			Enabled: true,
		},
	})
	now := time.Now().UTC()
	if _, err := rawDB.Exec(
		`INSERT INTO tasks (id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields, summary)
		 VALUES (?, ?, 'col-todo', '0|a', '["backend"]', ?, ?, '/tmp/legacy.md', ?, '')`,
		"legacy-1",
		"レガシータスク",
		now,
		now,
		string(cfJSON),
	); err != nil {
		_ = rawDB.Close()
		t.Fatalf("failed to insert legacy task: %v", err)
	}
	if _, err := rawDB.Exec(
		`INSERT INTO tasks_fts (id, title, content, tags) VALUES (?, ?, ?, ?)`,
		"legacy-1",
		"レガシータスク",
		"本文に含まれる重要キーワード",
		"backend",
	); err != nil {
		_ = rawDB.Close()
		t.Fatalf("failed to insert legacy fts row: %v", err)
	}
	_ = rawDB.Close()

	// Re-open with NewSQLiteCache to trigger automatic FTS migration
	c, err := NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("NewSQLiteCache migration failed: %v", err)
	}
	defer func() { _ = c.Close() }()

	// Custom field value must be searchable immediately after migration
	idsCF, err := c.SearchFTS("佐藤太郎")
	if err != nil {
		t.Fatalf("SearchFTS custom field after migration failed: %v", err)
	}
	if len(idsCF) != 1 || idsCF[0] != "legacy-1" {
		t.Errorf("expected ['legacy-1'] for custom field after migration, got %v", idsCF)
	}

	// Existing body content must also be preserved after migration
	idsContent, err := c.SearchFTS("重要キーワード")
	if err != nil {
		t.Fatalf("SearchFTS content after migration failed: %v", err)
	}
	if len(idsContent) != 1 || idsContent[0] != "legacy-1" {
		t.Errorf("expected ['legacy-1'] for content after migration, got %v", idsContent)
	}
}
