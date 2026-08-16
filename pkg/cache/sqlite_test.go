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
		ID:        "parent-1",
		Title:     "Parent Task",
		ColumnID:  "col-todo",
		Rank:      "0|a",
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

	// Test GetTasksByColumnIDs retrieves parent_id correctly
	tasksInTodo, err := cache.GetTasksByColumnIDs([]string{"col-todo"})
	if err != nil {
		t.Fatalf("failed to get tasks by column: %v", err)
	}
	if len(tasksInTodo) != 2 {
		t.Fatalf("expected 2 tasks in col-todo, got %d", len(tasksInTodo))
	}
}
