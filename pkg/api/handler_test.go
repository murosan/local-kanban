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

func TestGetTasksLightweightAndGetTaskByID(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	task := &model.Task{
		Title:    "Detailed Task",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Content:  "# Header\n\nThis is a long description for the detailed task.",
	}
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. GET /api/tasks should return lightweight task without content
	reqList := httptest.NewRequest("GET", "/api/tasks", nil)
	wList := httptest.NewRecorder()
	mux.ServeHTTP(wList, reqList)

	if wList.Code != http.StatusOK {
		t.Fatalf("expected status 200 GET /api/tasks, got %d", wList.Code)
	}

	var listTasks []*model.Task
	if err := json.NewDecoder(wList.Body).Decode(&listTasks); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}

	if len(listTasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(listTasks))
	}
	if listTasks[0].Content != "" {
		t.Errorf("expected empty content in list view, got %q", listTasks[0].Content)
	}
	if listTasks[0].Summary == "" {
		t.Errorf("expected non-empty summary in list view")
	}

	// 2. GET /api/tasks/{id} should return full task with content
	reqDetail := httptest.NewRequest("GET", "/api/tasks/"+task.ID, nil)
	wDetail := httptest.NewRecorder()
	mux.ServeHTTP(wDetail, reqDetail)

	if wDetail.Code != http.StatusOK {
		t.Fatalf("expected status 200 GET /api/tasks/{id}, got %d", wDetail.Code)
	}

	var detailTask model.Task
	if err := json.NewDecoder(wDetail.Body).Decode(&detailTask); err != nil {
		t.Fatalf("failed to decode detail response: %v", err)
	}

	if detailTask.Content != task.Content {
		t.Errorf("expected full content %q, got %q", task.Content, detailTask.Content)
	}
}

func TestGetTags(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. Initial GET /api/tags (empty)
	reqEmpty := httptest.NewRequest("GET", "/api/tags", nil)
	wEmpty := httptest.NewRecorder()
	mux.ServeHTTP(wEmpty, reqEmpty)

	if wEmpty.Code != http.StatusOK {
		t.Fatalf("expected status 200 GET /api/tags, got %d", wEmpty.Code)
	}

	var tagsEmpty []string
	if err := json.NewDecoder(wEmpty.Body).Decode(&tagsEmpty); err != nil {
		t.Fatalf("failed to decode tags response: %v", err)
	}
	if len(tagsEmpty) != 0 {
		t.Errorf("expected 0 tags, got %d", len(tagsEmpty))
	}

	// 2. Add tasks with tags (including duplicates, empty strings, spaces)
	task1 := &model.Task{
		Title:    "Task 1",
		ColumnID: "col-todo",
		Rank:     "0|a",
		Tags:     []string{"frontend", "react", "ui"},
	}
	task2 := &model.Task{
		Title:    "Task 2",
		ColumnID: "col-in-progress",
		Rank:     "0|b",
		Tags:     []string{"backend", "go", "react", "  "},
	}
	if err := store.SaveTask(task1); err != nil {
		t.Fatalf("failed to save task1: %v", err)
	}
	if err := store.SaveTask(task2); err != nil {
		t.Fatalf("failed to save task2: %v", err)
	}

	// 3. GET /api/tags after tasks added
	req := httptest.NewRequest("GET", "/api/tags", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 GET /api/tags, got %d", w.Code)
	}

	var tags []string
	if err := json.NewDecoder(w.Body).Decode(&tags); err != nil {
		t.Fatalf("failed to decode tags response: %v", err)
	}

	expectedTags := []string{"backend", "frontend", "go", "react", "ui"}
	if len(tags) != len(expectedTags) {
		t.Fatalf("expected %d unique tags, got %d: %+v", len(expectedTags), len(tags), tags)
	}

	for i, expected := range expectedTags {
		if tags[i] != expected {
			t.Errorf("expected tag[%d]=%q, got %q", i, expected, tags[i])
		}
	}
}

func TestSubtasksAPI(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. Create Parent Task via POST /api/tasks
	parentPayload := map[string]any{
		"title":     "Parent Task",
		"column_id": "col-todo",
	}
	bodyBytes, _ := json.Marshal(parentPayload)
	reqParent := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(bodyBytes))
	wParent := httptest.NewRecorder()
	mux.ServeHTTP(wParent, reqParent)

	if wParent.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for parent, got %d", wParent.Code)
	}

	var parentTask model.Task
	if err := json.NewDecoder(wParent.Body).Decode(&parentTask); err != nil {
		t.Fatalf("failed to decode parent: %v", err)
	}

	// 2. Create Subtask 1 via POST /api/tasks
	sub1Payload := map[string]any{
		"parent_id": parentTask.ID,
		"title":     "Subtask 1",
		"column_id": "col-todo",
	}
	sub1Bytes, _ := json.Marshal(sub1Payload)
	reqSub1 := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(sub1Bytes))
	wSub1 := httptest.NewRecorder()
	mux.ServeHTTP(wSub1, reqSub1)

	if wSub1.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for sub1, got %d", wSub1.Code)
	}

	var createdSub1 model.Task
	_ = json.NewDecoder(wSub1.Body).Decode(&createdSub1)

	// 3. Create Subtask 2 via POST /api/tasks
	sub2Payload := map[string]any{
		"parent_id": parentTask.ID,
		"title":     "Subtask 2 Done",
		"column_id": "col-todo",
	}
	sub2Bytes, _ := json.Marshal(sub2Payload)
	reqSub2 := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(sub2Bytes))
	wSub2 := httptest.NewRecorder()
	mux.ServeHTTP(wSub2, reqSub2)

	if wSub2.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for sub2, got %d", wSub2.Code)
	}
	var createdSub2 model.Task
	_ = json.NewDecoder(wSub2.Body).Decode(&createdSub2)

	// 3.5 Mark sub2 as completed on parent task via PUT /api/tasks/{parentTask.ID}
	updateParentPayload := map[string]any{
		"subtasks": []model.SubtaskRef{
			{ID: createdSub1.ID, Completed: false},
			{ID: createdSub2.ID, Completed: true},
		},
	}
	upBytes, _ := json.Marshal(updateParentPayload)
	reqUpdateParent := httptest.NewRequest(
		"PUT",
		"/api/tasks/"+parentTask.ID,
		bytes.NewReader(upBytes),
	)
	wUpdateParent := httptest.NewRecorder()
	mux.ServeHTTP(wUpdateParent, reqUpdateParent)
	if wUpdateParent.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for parent update, got %d", wUpdateParent.Code)
	}

	// 4. GET /api/tasks (verify parent has subtasks count 2, completed 1, and only root task returned)
	reqGetTasks := httptest.NewRequest("GET", "/api/tasks", nil)
	wGetTasks := httptest.NewRecorder()
	mux.ServeHTTP(wGetTasks, reqGetTasks)

	if wGetTasks.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wGetTasks.Code)
	}

	var tasks []*model.Task
	if err := json.NewDecoder(wGetTasks.Body).Decode(&tasks); err != nil {
		t.Fatalf("failed to decode tasks: %v", err)
	}

	if len(tasks) != 1 {
		t.Fatalf("expected 1 root task, got %d", len(tasks))
	}
	if tasks[0].ID != parentTask.ID {
		t.Errorf("expected parent task ID %s, got %s", parentTask.ID, tasks[0].ID)
	}
	if tasks[0].SubtasksCount != 2 {
		t.Errorf("expected subtasks count 2, got %d", tasks[0].SubtasksCount)
	}
	if tasks[0].SubtasksCompletedCount != 1 {
		t.Errorf("expected subtasks completed count 1, got %d", tasks[0].SubtasksCompletedCount)
	}
	subsSlice, ok := tasks[0].SubtaskDetails.([]any)
	if !ok || len(subsSlice) != 2 {
		t.Errorf("expected 2 subtask details attached, got %+v", tasks[0].SubtaskDetails)
	}

	// 5. Search query matching subtask title returns parent task
	reqSearch := httptest.NewRequest("GET", "/api/tasks?q=Done", nil)
	wSearch := httptest.NewRecorder()
	mux.ServeHTTP(wSearch, reqSearch)

	if wSearch.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for search, got %d", wSearch.Code)
	}
	var searchResults []*model.Task
	if err := json.NewDecoder(wSearch.Body).Decode(&searchResults); err != nil {
		t.Fatalf("failed to decode search results: %v", err)
	}
	if len(searchResults) != 1 || searchResults[0].ID != parentTask.ID {
		t.Errorf("expected parent task to match subtask query, got %+v", searchResults)
	}

	// 6. Test subtask reordering via parent subtasks array (move sub2 before sub1)
	reorderParentPayload := map[string]any{
		"subtasks": []model.SubtaskRef{
			{ID: createdSub2.ID, Completed: true},
			{ID: createdSub1.ID, Completed: false},
		},
	}
	reorderBytes, _ := json.Marshal(reorderParentPayload)
	reqReorder := httptest.NewRequest(
		"PUT",
		"/api/tasks/"+parentTask.ID,
		bytes.NewReader(reorderBytes),
	)
	wReorder := httptest.NewRecorder()
	mux.ServeHTTP(wReorder, reqReorder)

	if wReorder.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for reorder, got %d", wReorder.Code)
	}

	subtasksAfter, _ := store.GetSubtasksByParentID(parentTask.ID)
	if len(subtasksAfter) != 2 || subtasksAfter[0].ID != createdSub2.ID {
		t.Errorf(
			"expected subtask %s to be first after reordering, got %s",
			createdSub2.ID,
			subtasksAfter[0].ID,
		)
	}

	// 7. Test parent validation: create with invalid parent returns 400
	invalidCreatePayload := map[string]any{
		"parent_id": "non-existent-parent",
		"title":     "Invalid Subtask",
	}
	icBytes, _ := json.Marshal(invalidCreatePayload)
	reqInvalidCreate := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(icBytes))
	wInvalidCreate := httptest.NewRecorder()
	mux.ServeHTTP(wInvalidCreate, reqInvalidCreate)
	if wInvalidCreate.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for non-existent parent, got %d", wInvalidCreate.Code)
	}

	// 8. Test parent validation: update parent to self returns 400
	selfParentPayload := map[string]any{
		"parent_id": parentTask.ID,
	}
	spBytes, _ := json.Marshal(selfParentPayload)
	reqSelfParent := httptest.NewRequest(
		"PUT",
		"/api/tasks/"+parentTask.ID,
		bytes.NewReader(spBytes),
	)
	wSelfParent := httptest.NewRecorder()
	mux.ServeHTTP(wSelfParent, reqSelfParent)
	if wSelfParent.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for self-parent update, got %d", wSelfParent.Code)
	}
}
