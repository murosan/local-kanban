package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/murosan/local-kanban/pkg/markdown"
	"github.com/murosan/local-kanban/pkg/model"
)

func TestConfigRoutes(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. GET /api/config (Initial default)
	reqGet := httptest.NewRequest("GET", "/api/config", nil)
	wGet := httptest.NewRecorder()
	mux.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("expected status 200 GET /api/config, got %d", wGet.Code)
	}

	var cfg model.BoardConfig
	if err := json.NewDecoder(wGet.Body).Decode(&cfg); err != nil {
		t.Fatalf("failed to decode config: %v", err)
	}
	if cfg.Version != model.CurrentBoardConfigVersion {
		t.Errorf("expected version %d, got %d", model.CurrentBoardConfigVersion, cfg.Version)
	}
	if len(cfg.Columns) != 4 {
		t.Errorf("expected 4 default columns, got %d", len(cfg.Columns))
	}
	if cfg.Columns[0].Name != "Todo" {
		t.Errorf("expected column name 'Todo', got '%s'", cfg.Columns[0].Name)
	}

	// 2. PUT /api/config (Save theme, custom columns & custom fields)
	updatedCfg := model.BoardConfig{
		Columns: cfg.Columns,
		CustomFields: []model.CustomFieldDef{
			{
				ID:   "cf-priority",
				Name: "Priority",
				Type: model.FieldTypeDropdown,
				Options: []model.CustomFieldOption{
					{ID: "opt-1", Value: "High"},
					{ID: "opt-2", Value: "Low"},
				},
			},
		},
		Theme: &model.ThemeConfig{
			Name:        "midnight",
			PrimaryBg:   "#0a0e1a",
			CardBg:      "#1e293b",
			AccentColor: "#6366f1",
			TextColor:   "#f1f5f9",
		},
	}

	bodyBytes, _ := json.Marshal(updatedCfg)
	reqPut := httptest.NewRequest("PUT", "/api/config", bytes.NewReader(bodyBytes))
	wPut := httptest.NewRecorder()
	mux.ServeHTTP(wPut, reqPut)

	if wPut.Code != http.StatusOK {
		t.Fatalf("expected status 200 PUT /api/config, got %d", wPut.Code)
	}

	// 3. GET /api/config after PUT
	reqGet2 := httptest.NewRequest("GET", "/api/config", nil)
	wGet2 := httptest.NewRecorder()
	mux.ServeHTTP(wGet2, reqGet2)

	var cfg2 model.BoardConfig
	if err := json.NewDecoder(wGet2.Body).Decode(&cfg2); err != nil {
		t.Fatalf("failed to decode config: %v", err)
	}

	if cfg2.Theme == nil || cfg2.Theme.Name != "midnight" {
		t.Errorf("expected theme name 'midnight', got %+v", cfg2.Theme)
	}
	if len(cfg2.CustomFields) != 1 || cfg2.CustomFields[0].Name != "Priority" {
		t.Errorf("expected 1 custom field 'Priority', got %+v", cfg2.CustomFields)
	}
}

func TestGetTasksSearchEngine(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	task1 := &model.Task{
		Title:    "検索エンジン検証タスク alpha",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Tags:     []string{"alpha"},
		Content:  "アルファのテストコンテンツです",
	}
	task2 := &model.Task{
		Title:    "検索エンジン検証タスク beta",
		ColumnID: "col-in-progress",
		Rank:     "0|b",
		Tags:     []string{"beta"},
		Content:  "ベータのテストコンテンツです",
	}
	if err := store.SaveTask(task1); err != nil {
		t.Fatalf("failed to save task1: %v", err)
	}
	if err := store.SaveTask(task2); err != nil {
		t.Fatalf("failed to save task2: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// GET /api/tasks?q=alpha
	req := httptest.NewRequest("GET", "/api/tasks?q=alpha", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var tasks []*model.Task
	if err := json.NewDecoder(w.Body).Decode(&tasks); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(tasks) != 1 || tasks[0].Title != "検索エンジン検証タスク alpha" {
		t.Errorf("expected 1 task matching 'alpha', got %d", len(tasks))
	}
}

func TestRebuildCache(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	task := &model.Task{
		Title:    "Rebuild test task",
		ColumnID: "col-todo",
		Rank:     "0|a",
	}
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	req := httptest.NewRequest("POST", "/api/rebuild", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var res map[string]any
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if count, ok := res["count"].(float64); !ok || count != 1 {
		t.Errorf("expected count 1, got %v", res["count"])
	}
}

func TestGetTasksEmpty(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	req := httptest.NewRequest("GET", "/api/tasks", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	body := strings.TrimSpace(w.Body.String())
	if body != "[]" {
		t.Errorf("expected body '[]', got '%s'", body)
	}
}
