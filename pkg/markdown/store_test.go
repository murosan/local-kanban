package markdown

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/murosan/local-kanban/pkg/cache"
	"github.com/murosan/local-kanban/pkg/model"
)

func TestStoreCRUD(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "kanban_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()

	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	task := &model.Task{
		Title:    "Test Task 1",
		ColumnID: "col-todo",
		Rank:     "0|m",
		Tags:     []string{"go", "test"},
		Content:  "## Details\n- Test item",
	}

	// 1. Create
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task: %v", err)
	}

	if task.ID == "" {
		t.Errorf("expected generated ID, got empty string")
	}

	// 2. Read
	tasks, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("failed to get tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].Title != "Test Task 1" {
		t.Errorf("expected Title 'Test Task 1', got '%s'", tasks[0].Title)
	}
	if tasks[0].Content != "## Details\n- Test item" {
		t.Errorf("content mismatch")
	}

	// 3. Update
	tasks[0].ColumnID = "col-in-progress"
	tasks[0].Rank = "0|t"
	if err := store.SaveTask(tasks[0]); err != nil {
		t.Fatalf("failed to update task: %v", err)
	}

	updatedTask, err := store.GetTaskByID(task.ID)
	if err != nil {
		t.Fatalf("failed to get task by ID: %v", err)
	}
	if updatedTask.ColumnID != "col-in-progress" {
		t.Errorf("expected ColumnID 'col-in-progress', got '%s'", updatedTask.ColumnID)
	}

	// 4. Delete
	if err := store.DeleteTask(task.ID); err != nil {
		t.Fatalf("failed to delete task: %v", err)
	}

	tasksAfterDelete, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("failed to list tasks after delete: %v", err)
	}
	if len(tasksAfterDelete) != 0 {
		t.Errorf("expected 0 tasks after delete, got %d", len(tasksAfterDelete))
	}
}

func TestBoardConfigMigration(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	legacyConfigJSON := `{
  "columns": [
    {
      "id": "col-todo",
      "title": "Todo Legacy",
      "visible": true,
      "order": 1
    },
    {
      "id": "col-done",
      "title": "Done Legacy",
      "visible": true,
      "order": 2
    }
  ],
  "language": "ja"
}`

	configPath := tmpDir + "/.kanban_config.json"
	if err := os.WriteFile(configPath, []byte(legacyConfigJSON), 0o644); err != nil {
		t.Fatalf("failed to write legacy config: %v", err)
	}

	cfg, err := store.GetBoardConfig()
	if err != nil {
		t.Fatalf("GetBoardConfig failed: %v", err)
	}

	if cfg.Version != model.CurrentBoardConfigVersion {
		t.Errorf("expected version %d, got %d", model.CurrentBoardConfigVersion, cfg.Version)
	}

	if len(cfg.Columns) != 2 {
		t.Fatalf("expected 2 columns, got %d", len(cfg.Columns))
	}

	if cfg.Columns[0].Name != "Todo Legacy" {
		t.Errorf("expected Name 'Todo Legacy', got '%s'", cfg.Columns[0].Name)
	}
	if cfg.Columns[1].Name != "Done Legacy" {
		t.Errorf("expected Name 'Done Legacy', got '%s'", cfg.Columns[1].Name)
	}

	// Verify migrated file content on disk
	cleanConfigPath := filepath.Clean(configPath)
	diskData, err := os.ReadFile(cleanConfigPath) // #nosec G304
	if err != nil {
		t.Fatalf("failed to read migrated config file: %v", err)
	}

	diskStr := string(diskData)
	if diskStr == legacyConfigJSON {
		t.Errorf("expected disk file to be updated with migrated JSON")
	}
}

func TestBoardConfigColumnSettingsRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	boolPtr := func(v bool) *bool { return &v }

	cfg := &model.BoardConfig{
		Version: model.CurrentBoardConfigVersion,
		Columns: []model.Column{
			{
				ID:      "col-todo",
				Name:    "Todo",
				Visible: true,
				Order:   1,
			},
			{
				ID:      "col-done",
				Name:    "Done",
				Visible: true,
				Order:   2,
				Settings: &model.ColumnSettings{
					ShowCards:       boolPtr(false),
					ShowCardDetails: boolPtr(false),
				},
			},
			{
				ID:      "col-template",
				Name:    "Template",
				Visible: true,
				Order:   3,
				Settings: &model.ColumnSettings{
					ShowCards:       boolPtr(true),
					ShowCardDetails: boolPtr(false),
				},
			},
		},
		Language: "ja",
	}

	if err := store.SaveBoardConfig(cfg); err != nil {
		t.Fatalf("SaveBoardConfig failed: %v", err)
	}

	loaded, err := store.GetBoardConfig()
	if err != nil {
		t.Fatalf("GetBoardConfig failed: %v", err)
	}

	if len(loaded.Columns) != 3 {
		t.Fatalf("expected 3 columns, got %d", len(loaded.Columns))
	}

	if !loaded.Columns[0].Settings.IsShowCards() ||
		!loaded.Columns[0].Settings.IsShowCardDetails() {
		t.Errorf("expected nil settings to default to true, got %+v", loaded.Columns[0].Settings)
	}
	if loaded.Columns[1].Settings == nil ||
		loaded.Columns[1].Settings.IsShowCards() ||
		loaded.Columns[1].Settings.IsShowCardDetails() {
		t.Errorf(
			"expected col-done settings to preserve false values, got %+v",
			loaded.Columns[1].Settings,
		)
	}
	if loaded.Columns[2].Settings == nil ||
		!loaded.Columns[2].Settings.IsShowCards() ||
		loaded.Columns[2].Settings.IsShowCardDetails() {
		t.Errorf(
			"expected col-template settings to preserve show_cards=true, show_card_details=false, got %+v",
			loaded.Columns[2].Settings,
		)
	}

	// Ensure columns with show_cards=false remain visible to task queries so counts & search work
	doneTask := &model.Task{Title: "Finished Task", ColumnID: "col-done", Rank: "0|a"}
	if err := store.SaveTask(doneTask); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}
	visibleTasks, err := store.GetVisibleTasks()
	if err != nil {
		t.Fatalf("GetVisibleTasks failed: %v", err)
	}
	if len(visibleTasks) != 1 || visibleTasks[0].ID != doneTask.ID {
		t.Errorf(
			"expected task in column with show_cards=false to remain in GetVisibleTasks, got %+v",
			visibleTasks,
		)
	}
}

func TestGetAllTasksEmpty(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	tasks, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("GetAllTasks failed: %v", err)
	}
	if tasks == nil {
		t.Errorf("expected non-nil tasks slice, got nil")
	}
	if len(tasks) != 0 {
		t.Errorf("expected 0 tasks, got %d", len(tasks))
	}

	data, err := json.Marshal(tasks)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	if string(data) != "[]" {
		t.Errorf("expected JSON '[]', got '%s'", string(data))
	}
}

func TestGetVisibleTasksAndColumnFiltering(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	// 1. Setup board config with visible and hidden columns
	cfg := &model.BoardConfig{
		Version: model.CurrentBoardConfigVersion,
		Columns: []model.Column{
			{ID: "col-todo", Name: "Todo", Visible: true},
			{ID: "col-hidden", Name: "Hidden", Visible: false},
			{ID: "col-done", Name: "Done", Visible: true},
		},
	}
	if err := store.SaveBoardConfig(cfg); err != nil {
		t.Fatalf("failed to save board config: %v", err)
	}

	// 2. Create tasks in various columns
	t1 := &model.Task{Title: "Task Todo", ColumnID: "col-todo", Rank: "0|a"}
	t2 := &model.Task{Title: "Task Hidden", ColumnID: "col-hidden", Rank: "0|b"}
	t3 := &model.Task{Title: "Task Deleted Col", ColumnID: "col-deleted", Rank: "0|c"}
	t4 := &model.Task{Title: "Task Done", ColumnID: "col-done", Rank: "0|d"}

	for _, task := range []*model.Task{t1, t2, t3, t4} {
		if err := store.SaveTask(task); err != nil {
			t.Fatalf("failed to save task %s: %v", task.Title, err)
		}
	}

	// 3. Test GetVisibleTasks without cache
	visTasks, err := store.GetVisibleTasks()
	if err != nil {
		t.Fatalf("GetVisibleTasks failed: %v", err)
	}
	if len(visTasks) != 2 {
		t.Fatalf("expected 2 visible tasks, got %d", len(visTasks))
	}
	expectedTitles := map[string]bool{"Task Todo": true, "Task Done": true}
	for _, vt := range visTasks {
		if !expectedTitles[vt.Title] {
			t.Errorf("unexpected task in visible list: %s", vt.Title)
		}
	}

	// 4. Set SQLite cache and sync
	dbPath := filepath.Join(tmpDir, "cache.db")
	c, err := cache.NewSQLiteCache(dbPath)
	if err != nil {
		t.Fatalf("failed to create sqlite cache: %v", err)
	}
	defer func() { _ = c.Close() }()
	store.SetCache(c)

	if err := store.SyncCache(); err != nil {
		t.Fatalf("failed to sync cache: %v", err)
	}

	// 5. Test GetVisibleTasks with cache
	visTasksCache, err := store.GetVisibleTasks()
	if err != nil {
		t.Fatalf("GetVisibleTasks with cache failed: %v", err)
	}
	if len(visTasksCache) != 2 {
		t.Fatalf("expected 2 visible tasks with cache, got %d", len(visTasksCache))
	}
	for _, vt := range visTasksCache {
		if !expectedTitles[vt.Title] {
			t.Errorf("unexpected task in visible list with cache: %s", vt.Title)
		}
	}

	// 6. Test GetTasksByColumnID with cache
	todoTasks, err := store.GetTasksByColumnID("col-todo")
	if err != nil {
		t.Fatalf("GetTasksByColumnID failed: %v", err)
	}
	if len(todoTasks) != 1 || todoTasks[0].Title != "Task Todo" {
		t.Errorf("expected 1 task ('Task Todo') for col-todo, got %v", todoTasks)
	}

	// 7. Hidden/deleted column direct query should return empty
	hiddenTasks, err := store.GetTasksByColumnID("col-deleted")
	if err != nil {
		t.Fatalf("GetTasksByColumnID for deleted col failed: %v", err)
	}
	if len(hiddenTasks) != 0 {
		t.Errorf("expected 0 tasks for deleted col, got %d", len(hiddenTasks))
	}
}

func TestLegacyTaskCustomFieldsMigration(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	legacyTaskMD := `---
id: task-legacy-1
title: Legacy Task
column_id: col-todo
rank: 0|a
custom_fields:
  cf-priority:
    field_id: cf-priority
    value: High
    enabled: true
---

Body content
`
	taskPath := filepath.Join(tmpDir, "legacy_task.md")
	if err := os.WriteFile(taskPath, []byte(legacyTaskMD), 0o644); err != nil {
		t.Fatalf("failed to write legacy task file: %v", err)
	}

	task, err := store.GetTaskByID("task-legacy-1")
	if err != nil {
		t.Fatalf("failed to read legacy task: %v", err)
	}

	if task.Version != model.CurrentTaskVersion {
		t.Errorf("expected task version %d, got %d", model.CurrentTaskVersion, task.Version)
	}

	if len(task.CustomFields) != 1 {
		t.Fatalf("expected 1 custom field in array, got %d", len(task.CustomFields))
	}

	cf := task.CustomFields[0]
	if cf.ID != "cf-priority" || cf.Value != "High" {
		t.Errorf("unexpected custom field migrated: %+v", cf)
	}
}

func TestChecklistCustomField(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	checklistItems := []map[string]any{
		{"id": "item-1", "text": "Design API", "completed": true},
		{"id": "item-2", "text": "Implement backend", "completed": false},
	}

	task := &model.Task{
		Title:    "Checklist Test Task",
		ColumnID: "col-todo",
		Rank:     "0|m",
		CustomFields: []model.CustomFieldValue{
			{
				ID:      "cf-checklist-1",
				Name:    "Subtasks",
				Type:    model.FieldTypeChecklist,
				Value:   checklistItems,
				Enabled: true,
			},
		},
		Content: "Task with checklist field",
	}

	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task with checklist: %v", err)
	}

	loadedTask, err := store.GetTaskByID(task.ID)
	if err != nil {
		t.Fatalf("failed to get task: %v", err)
	}

	if len(loadedTask.CustomFields) != 1 {
		t.Fatalf("expected 1 custom field, got %d", len(loadedTask.CustomFields))
	}

	cf := loadedTask.CustomFields[0]
	if cf.Type != model.FieldTypeChecklist {
		t.Errorf("expected type %s, got %s", model.FieldTypeChecklist, cf.Type)
	}

	// Verify items survived roundtrip
	items, ok := cf.Value.([]any)
	if !ok {
		t.Fatalf("expected []any for checklist value, got %T (%+v)", cf.Value, cf.Value)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
}

func TestLinkListCustomField(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	linkItems := []model.LinkItem{
		{ID: "link-1", URL: "https://example.com/spec", Label: "仕様書"},
		{ID: "link-2", URL: "vscode://file/workspace/app.go"},
	}

	task := &model.Task{
		Title:    "Link List Test Task",
		ColumnID: "col-todo",
		Rank:     "0|m",
		CustomFields: []model.CustomFieldValue{
			{
				ID:      "cf-link-1",
				Name:    "関連リンク",
				Type:    model.FieldTypeLink,
				Value:   linkItems,
				Enabled: true,
			},
		},
		Content: "Task with multiple links",
	}

	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task with link list: %v", err)
	}

	loadedTask, err := store.GetTaskByID(task.ID)
	if err != nil {
		t.Fatalf("failed to get task: %v", err)
	}

	if len(loadedTask.CustomFields) != 1 {
		t.Fatalf("expected 1 custom field, got %d", len(loadedTask.CustomFields))
	}

	cf := loadedTask.CustomFields[0]
	if cf.Type != model.FieldTypeLink {
		t.Errorf("expected type %s, got %s", model.FieldTypeLink, cf.Type)
	}

	items, ok := cf.Value.([]any)
	if !ok {
		t.Fatalf("expected []any for link list value, got %T (%+v)", cf.Value, cf.Value)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 link items, got %d", len(items))
	}
	first, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any for first link item, got %T", items[0])
	}
	if first["label"] != "仕様書" || first["url"] != "https://example.com/spec" {
		t.Errorf("unexpected first link item: %+v", first)
	}
	second, ok := items[1].(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any for second link item, got %T", items[1])
	}
	if second["url"] != "vscode://file/workspace/app.go" {
		t.Errorf("unexpected second link item: %+v", second)
	}
}

func TestSubtasksCRUDAndCascade(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	cacheDBPath := filepath.Join(tmpDir, "cache.db")
	c, err := cache.NewSQLiteCache(cacheDBPath)
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer func() { _ = c.Close() }()
	store.SetCache(c)

	parent := &model.Task{
		Title:    "Parent Task",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Content:  "Parent content",
	}
	if err := store.SaveTask(parent); err != nil {
		t.Fatalf("failed to save parent: %v", err)
	}

	sub1 := &model.Task{
		ParentID: parent.ID,
		Title:    "Subtask 1",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Content:  "Subtask 1 content",
	}
	if err := store.SaveTask(sub1); err != nil {
		t.Fatalf("failed to save sub1: %v", err)
	}

	sub2 := &model.Task{
		ParentID: parent.ID,
		Title:    "Subtask 2",
		ColumnID: "col-done",
		Rank:     "0|b",
		Content:  "Subtask 2 content",
	}
	if err := store.SaveTask(sub2); err != nil {
		t.Fatalf("failed to save sub2: %v", err)
	}

	// Verify GetSubtasksByParentID
	subtasks, err := store.GetSubtasksByParentID(parent.ID)
	if err != nil {
		t.Fatalf("failed to get subtasks: %v", err)
	}
	if len(subtasks) != 2 {
		t.Fatalf("expected 2 subtasks, got %d", len(subtasks))
	}

	// Verify subtask markdown file contains parent_id
	loadedSub1, err := store.GetTaskByID(sub1.ID)
	if err != nil {
		t.Fatalf("failed to get sub1: %v", err)
	}
	if loadedSub1.ParentID != parent.ID {
		t.Errorf("expected parent_id %s, got %s", parent.ID, loadedSub1.ParentID)
	}

	// Cascade delete parent
	if err := store.DeleteTask(parent.ID); err != nil {
		t.Fatalf("failed to delete parent: %v", err)
	}

	// Verify parent and all subtasks are deleted
	allTasks, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("failed to get all tasks: %v", err)
	}
	if len(allTasks) != 0 {
		t.Errorf("expected 0 tasks after cascade delete, got %d", len(allTasks))
	}
}

func TestValidateParentID(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	// Empty parentID is always valid
	if err := store.ValidateParentID("any-id", ""); err != nil {
		t.Errorf("expected empty parent_id to be valid, got %v", err)
	}

	// 1. Non-existent parent
	if err := store.ValidateParentID("task-1", "non-existent-id"); err == nil {
		t.Error("expected error for non-existent parent, got nil")
	}

	// 2. Self parent
	if err := store.ValidateParentID("task-1", "task-1"); err == nil {
		t.Error("expected error for self-parent, got nil")
	}

	// Create root tasks A and B
	taskA := &model.Task{Title: "Task A", ColumnID: "col-todo", Rank: "0|a"}
	if err := store.SaveTask(taskA); err != nil {
		t.Fatalf("failed to save taskA: %v", err)
	}
	taskB := &model.Task{Title: "Task B", ColumnID: "col-todo", Rank: "0|b"}
	if err := store.SaveTask(taskB); err != nil {
		t.Fatalf("failed to save taskB: %v", err)
	}

	// Valid parent setting: B is parent of A
	if err := store.ValidateParentID(taskA.ID, taskB.ID); err != nil {
		t.Errorf("expected valid parent setting, got %v", err)
	}

	// Make sub1 a subtask of taskA
	sub1 := &model.Task{ParentID: taskA.ID, Title: "Sub 1", ColumnID: "col-todo", Rank: "0|a"}
	if err := store.SaveTask(sub1); err != nil {
		t.Fatalf("failed to save sub1: %v", err)
	}

	// 3. Multi-level nesting: setting sub1 as parent of taskB should fail (sub1 is already a subtask)
	if err := store.ValidateParentID(taskB.ID, sub1.ID); err == nil {
		t.Error("expected error when setting a subtask as parent, got nil")
	}

	// 4. Task with existing subtasks cannot become a subtask of another task: taskA has sub1, so taskA cannot have parent taskB
	if err := store.ValidateParentID(taskA.ID, taskB.ID); err == nil {
		t.Error("expected error when task with subtasks tries to become a subtask, got nil")
	}
}

func TestGetSubtasksByParentID_UnlistedSubtasks(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	cacheDBPath := filepath.Join(tmpDir, "cache.db")
	c, err := cache.NewSQLiteCache(cacheDBPath)
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer func() { _ = c.Close() }()
	store.SetCache(c)

	parent := &model.Task{
		Title:    "Parent Task",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Content:  "Parent content",
	}
	if err := store.SaveTask(parent); err != nil {
		t.Fatalf("failed to save parent: %v", err)
	}

	sub1 := &model.Task{
		ParentID: parent.ID,
		Title:    "Subtask 1",
		ColumnID: "col-todo",
		Rank:     "0|a",
	}
	if err := store.SaveTask(sub1); err != nil {
		t.Fatalf("failed to save sub1: %v", err)
	}

	// Register sub1 in parent.Subtasks
	parent.Subtasks = []model.SubtaskRef{
		{ID: sub1.ID, Completed: false},
	}
	if err := store.SaveTask(parent); err != nil {
		t.Fatalf("failed to update parent with sub1: %v", err)
	}

	// sub2 has parent_id set, but is not yet in parent.Subtasks (e.g. linked via existing card)
	sub2 := &model.Task{
		ParentID: parent.ID,
		Title:    "Subtask 2 (linked existing)",
		ColumnID: "col-todo",
		Rank:     "0|b",
	}
	if err := store.SaveTask(sub2); err != nil {
		t.Fatalf("failed to save sub2: %v", err)
	}

	subtasks, err := store.GetSubtasksByParentID(parent.ID)
	if err != nil {
		t.Fatalf("failed to get subtasks: %v", err)
	}
	if len(subtasks) != 2 {
		t.Fatalf(
			"expected 2 subtasks even when sub2 is not yet listed in parent.Subtasks, got %d",
			len(subtasks),
		)
	}
}

func TestGetTaskByIDPreservesContentWithCache(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	c, err := cache.NewSQLiteCache(filepath.Join(tmpDir, "cache.db"))
	if err != nil {
		t.Fatalf("failed to init cache: %v", err)
	}
	defer func() { _ = c.Close() }()
	store.SetCache(c)

	task := &model.Task{
		Title:    "Body Preservation Task",
		ColumnID: "col-todo",
		Rank:     "0|i0000i",
		Content:  "# Details\n\nImportant markdown body that must never be lost.",
	}
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task: %v", err)
	}

	loaded, err := store.GetTaskByID(task.ID)
	if err != nil {
		t.Fatalf("GetTaskByID failed: %v", err)
	}
	if loaded.Content != task.Content {
		t.Fatalf("expected content %q, got %q", task.Content, loaded.Content)
	}

	// Simulate partial update (e.g. moving column without touching Content)
	loaded.ColumnID = "col-done"
	if err := store.SaveTask(loaded); err != nil {
		t.Fatalf("failed to save updated task: %v", err)
	}

	reloaded, err := store.GetTaskByID(task.ID)
	if err != nil {
		t.Fatalf("GetTaskByID after update failed: %v", err)
	}
	if reloaded.Content != task.Content {
		t.Fatalf(
			"expected content preserved after update %q, got %q",
			task.Content,
			reloaded.Content,
		)
	}

	// Clearing content must also clear summary in cache
	reloaded.Content = ""
	if err := store.SaveTask(reloaded); err != nil {
		t.Fatalf("failed to save cleared content: %v", err)
	}
	cachedTasks, err := store.GetVisibleTasks()
	if err != nil {
		t.Fatalf("GetVisibleTasks failed: %v", err)
	}
	if len(cachedTasks) != 1 || cachedTasks[0].Summary != "" {
		t.Fatalf("expected cleared summary after clearing content, got %+v", cachedTasks)
	}
}

func TestDeleteTaskCascadeWithoutCache(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	parent := &model.Task{Title: "Parent", ColumnID: "col-todo", Rank: "0|a"}
	if err := store.SaveTask(parent); err != nil {
		t.Fatalf("failed to save parent: %v", err)
	}

	// Subtask only linked via ParentID (not listed in parent.Subtasks)
	unlistedChild := &model.Task{
		ParentID: parent.ID,
		Title:    "Unlisted Child",
		ColumnID: "col-todo",
		Rank:     "0|b",
	}
	if err := store.SaveTask(unlistedChild); err != nil {
		t.Fatalf("failed to save child: %v", err)
	}

	if err := store.DeleteTask(parent.ID); err != nil {
		t.Fatalf("DeleteTask failed: %v", err)
	}

	remaining, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("GetAllTasks failed: %v", err)
	}
	if len(remaining) != 0 {
		t.Fatalf(
			"expected 0 remaining tasks after cascade delete without cache, got %d",
			len(remaining),
		)
	}
}

func TestParseTaskContentCRLFAndUnversionedSubtasks(t *testing.T) {
	raw := "---\r\nid: task-unversioned\r\ntitle: Unversioned\r\ncolumn_id: col-todo\r\nrank: 0|a\r\nsubtasks:\r\n  - id: sub-1\r\n    completed: true\r\n---\r\n\r\nLine 1\r\nLine 2"
	task, err := parseTaskContent(raw)
	if err != nil {
		t.Fatalf("parseTaskContent failed: %v", err)
	}
	if len(task.Subtasks) != 1 || task.Subtasks[0].ID != "sub-1" || !task.Subtasks[0].Completed {
		t.Errorf("expected subtasks preserved on unversioned task, got %+v", task.Subtasks)
	}
	if task.Content != "Line 1\nLine 2" {
		t.Errorf("expected normalized content 'Line 1\\nLine 2', got %q", task.Content)
	}
}

func TestConcurrentGetVisibleColumnIDsWithLegacyConfig(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	legacyConfigJSON := `{"columns":[{"id":"col-todo","title":"Todo","visible":true}]}`
	if err := os.WriteFile(
		filepath.Join(tmpDir, ".kanban_config.json"),
		[]byte(legacyConfigJSON),
		0o644,
	); err != nil {
		t.Fatalf("failed to write legacy config: %v", err)
	}

	done := make(chan struct{})
	for range 8 {
		go func() {
			defer func() { done <- struct{}{} }()
			for range 20 {
				ids, err := store.GetVisibleColumnIDs()
				if err != nil || len(ids) != 1 || ids[0] != "col-todo" {
					t.Errorf("unexpected visible column IDs: %v, err=%v", ids, err)
					return
				}
			}
		}()
	}
	for range 8 {
		<-done
	}
}

func TestInsertSubtaskLinkAfter(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	parent := &model.Task{
		Title:    "Parent",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Subtasks: []model.SubtaskRef{
			{ID: "sub-1", Completed: true},
			{ID: "sub-2", Completed: false},
		},
	}
	if err := store.SaveTask(parent); err != nil {
		t.Fatalf("failed to save parent: %v", err)
	}

	if err := store.InsertSubtaskLinkAfter(parent.ID, "sub-1", "sub-1-copy", true); err != nil {
		t.Fatalf("InsertSubtaskLinkAfter failed: %v", err)
	}

	reloaded, err := store.GetTaskByID(parent.ID)
	if err != nil {
		t.Fatalf("GetTaskByID failed: %v", err)
	}
	if len(reloaded.Subtasks) != 3 {
		t.Fatalf("expected 3 subtasks, got %d", len(reloaded.Subtasks))
	}
	if reloaded.Subtasks[0].ID != "sub-1" ||
		reloaded.Subtasks[1].ID != "sub-1-copy" ||
		!reloaded.Subtasks[1].Completed ||
		reloaded.Subtasks[2].ID != "sub-2" {
		t.Errorf("unexpected subtask order: %+v", reloaded.Subtasks)
	}
}
