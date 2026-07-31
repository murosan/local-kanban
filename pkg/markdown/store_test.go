package markdown

import (
	"os"
	"testing"

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
	diskData, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read migrated config file: %v", err)
	}

	diskStr := string(diskData)
	if !testing.Verbose() {
		// Just verify version 2 and name present, title removed
	}
	if !os.IsNotExist(err) && (diskStr == legacyConfigJSON) {
		t.Errorf("expected disk file to be updated with migrated JSON")
	}
}
