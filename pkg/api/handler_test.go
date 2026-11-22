package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"github.com/murosan/local-kanban/pkg/cache"
	"github.com/murosan/local-kanban/pkg/markdown"
	"github.com/murosan/local-kanban/pkg/model"
	"github.com/murosan/local-kanban/pkg/search"
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

	// 9. Test linking existing card as subtask to parent with existing subtasks
	standalonePayload := map[string]any{
		"title":     "Standalone Card",
		"column_id": "col-todo",
	}
	stBytes, _ := json.Marshal(standalonePayload)
	reqSt := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(stBytes))
	wSt := httptest.NewRecorder()
	mux.ServeHTTP(wSt, reqSt)
	if wSt.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for standalone card, got %d", wSt.Code)
	}
	var standaloneCard model.Task
	_ = json.NewDecoder(wSt.Body).Decode(&standaloneCard)

	// Update standalone card to link it as subtask of parentTask (which already has sub1 and sub2)
	linkPayload := map[string]any{
		"parent_id": parentTask.ID,
	}
	lpBytes, _ := json.Marshal(linkPayload)
	reqLink := httptest.NewRequest("PUT", "/api/tasks/"+standaloneCard.ID, bytes.NewReader(lpBytes))
	wLink := httptest.NewRecorder()
	mux.ServeHTTP(wLink, reqLink)
	if wLink.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for linking subtask, got %d", wLink.Code)
	}

	// Verify parent task now has 3 subtasks
	reqGetParent := httptest.NewRequest("GET", "/api/tasks/"+parentTask.ID, nil)
	wGetParent := httptest.NewRecorder()
	mux.ServeHTTP(wGetParent, reqGetParent)
	if wGetParent.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wGetParent.Code)
	}
	var loadedParent model.Task
	_ = json.NewDecoder(wGetParent.Body).Decode(&loadedParent)
	if loadedParent.SubtasksCount != 3 {
		t.Errorf(
			"expected 3 subtasks on parent after linking existing card, got %d",
			loadedParent.SubtasksCount,
		)
	}
}

func TestMoveTaskToTopOfAnotherColumnAndRebalance(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	sqliteCache, err := cache.NewSQLiteCache(filepath.Join(tempDir, ".local_cache.db"))
	if err != nil {
		t.Fatalf("failed to create sqlite cache: %v", err)
	}
	defer func() { _ = sqliteCache.Close() }()
	store.SetCache(sqliteCache)

	// Reproduce legacy Done column ranks that previously broke head insertion:
	// 0|a, 0|aa, 0|aam, 0|aam, 0|b
	done1 := &model.Task{Title: "Done 1", ColumnID: "col-done", Rank: "0|a", Content: "Body Done 1"}
	done2 := &model.Task{
		Title:    "Done 2",
		ColumnID: "col-done",
		Rank:     "0|aa",
		Content:  "Body Done 2",
	}
	done3 := &model.Task{
		Title:    "Done 3",
		ColumnID: "col-done",
		Rank:     "0|aam",
		Content:  "Body Done 3",
	}
	done4 := &model.Task{
		Title:    "Done 4",
		ColumnID: "col-done",
		Rank:     "0|aam",
		Content:  "Body Done 4",
	}
	done5 := &model.Task{Title: "Done 5", ColumnID: "col-done", Rank: "0|b", Content: "Body Done 5"}
	moving1 := &model.Task{
		Title:    "Moving 1",
		ColumnID: "col-in-progress",
		Rank:     "0|m",
		Content:  "Body Moving 1",
	}
	moving2 := &model.Task{
		Title:    "Moving 2",
		ColumnID: "col-in-progress",
		Rank:     "0|n",
		Content:  "Body Moving 2",
	}
	moving3 := &model.Task{
		Title:    "Moving 3",
		ColumnID: "col-todo",
		Rank:     "0|m",
		Content:  "Body Moving 3",
	}

	for _, task := range []*model.Task{done1, done2, done3, done4, done5, moving1, moving2, moving3} {
		if err := store.SaveTask(task); err != nil {
			t.Fatalf("failed to save task %s: %v", task.Title, err)
		}
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	getDoneIDs := func() []string {
		req := httptest.NewRequest("GET", "/api/tasks", nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("GET /api/tasks failed with %d", w.Code)
		}
		var all []*model.Task
		if err := json.NewDecoder(w.Body).Decode(&all); err != nil {
			t.Fatalf("failed to decode tasks: %v", err)
		}
		var ids []string
		for _, task := range all {
			if task.ColumnID == "col-done" {
				ids = append(ids, task.ID)
			}
		}
		return ids
	}

	moveTask := func(taskID, columnID, prevID, nextID string) {
		payload := map[string]any{
			"column_id": columnID,
			"prev_id":   prevID,
			"next_id":   nextID,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("PUT", "/api/tasks/"+taskID, bytes.NewReader(body))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("PUT /api/tasks/%s failed with %d: %s", taskID, w.Code, w.Body.String())
		}
	}

	// 1. Move moving1 from another column to the top of col-done (before 0|a)
	moveTask(moving1.ID, "col-done", "", done1.ID)
	ids := getDoneIDs()
	if len(ids) != 6 || ids[0] != moving1.ID || ids[1] != done1.ID {
		t.Fatalf("expected moving1 at index 0 before done1, got %v", ids)
	}

	// 2. Move moving2 between done1 (0|a) and done2 (0|aa)
	moveTask(moving2.ID, "col-done", done1.ID, done2.ID)
	ids = getDoneIDs()
	if len(ids) != 7 || ids[0] != moving1.ID || ids[1] != done1.ID || ids[2] != moving2.ID ||
		ids[3] != done2.ID {
		t.Fatalf("expected moving2 between done1 and done2, got %v", ids)
	}

	// 3. Move moving3 between duplicate ranks done3 (0|aam) and done4 (0|aam) -> triggers rebalance
	// Identify current order of done3 & done4 first (tie-broken by ID)
	idsBeforeDupInsert := getDoneIDs()
	var dupFirstID, dupSecondID string
	for i := 0; i < len(idsBeforeDupInsert)-1; i++ {
		a, b := idsBeforeDupInsert[i], idsBeforeDupInsert[i+1]
		if (a == done3.ID && b == done4.ID) || (a == done4.ID && b == done3.ID) {
			dupFirstID, dupSecondID = a, b
			break
		}
	}
	if dupFirstID == "" || dupSecondID == "" {
		t.Fatalf("could not find duplicate rank neighbors in %v", idsBeforeDupInsert)
	}

	done2UpdatedBefore := done2.UpdatedAt
	moveTask(moving3.ID, "col-done", dupFirstID, dupSecondID)
	ids = getDoneIDs()
	expectedOrder := []string{
		moving1.ID,
		done1.ID,
		moving2.ID,
		done2.ID,
		dupFirstID,
		moving3.ID,
		dupSecondID,
		done5.ID,
	}
	if len(ids) != len(expectedOrder) {
		t.Fatalf("expected %d done tasks, got %d (%v)", len(expectedOrder), len(ids), ids)
	}
	for i := range expectedOrder {
		if ids[i] != expectedOrder[i] {
			t.Fatalf(
				"at index %d: expected %s, got %s (full order: %v)",
				i,
				expectedOrder[i],
				ids[i],
				ids,
			)
		}
	}

	// Verify rebalance preserved Markdown body content and UpdatedAt of untouched tasks
	allFromDisk, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("GetAllTasks failed: %v", err)
	}
	var diskDone2 *model.Task
	for _, task := range allFromDisk {
		if task.ID == done2.ID {
			diskDone2 = task
			break
		}
	}
	if diskDone2 == nil {
		t.Fatalf("done2 not found on disk")
	}
	if diskDone2.Content != "Body Done 2" {
		t.Errorf("expected done2 content preserved after rebalance, got %q", diskDone2.Content)
	}
	if !diskDone2.UpdatedAt.Equal(done2UpdatedBefore) {
		t.Errorf(
			"expected done2 UpdatedAt preserved after rebalance (%v vs %v)",
			diskDone2.UpdatedAt,
			done2UpdatedBefore,
		)
	}
}

func TestMoveTaskBeforeMinRankRebalances(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	minTask := &model.Task{
		Title:    "At Min",
		ColumnID: "col-done",
		Rank:     "0|0",
		Content:  "Min content",
	}
	secondTask := &model.Task{
		Title:    "Second",
		ColumnID: "col-done",
		Rank:     "0|a",
		Content:  "Second content",
	}
	incoming := &model.Task{
		Title:    "Incoming",
		ColumnID: "col-todo",
		Rank:     "0|m",
		Content:  "Incoming content",
	}
	for _, task := range []*model.Task{minTask, secondTask, incoming} {
		if err := store.SaveTask(task); err != nil {
			t.Fatalf("failed to save task: %v", err)
		}
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	body, _ := json.Marshal(map[string]any{
		"column_id": "col-done",
		"prev_id":   "",
		"next_id":   minTask.ID,
	})
	req := httptest.NewRequest("PUT", "/api/tasks/"+incoming.ID, bytes.NewReader(body))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT failed with %d: %s", w.Code, w.Body.String())
	}

	doneTasks, err := store.GetTasksByColumnID("col-done")
	if err != nil {
		t.Fatalf("GetTasksByColumnID failed: %v", err)
	}
	if len(doneTasks) != 3 {
		t.Fatalf("expected 3 tasks in col-done, got %d", len(doneTasks))
	}
	if doneTasks[0].ID != incoming.ID || doneTasks[1].ID != minTask.ID ||
		doneTasks[2].ID != secondTask.ID {
		t.Fatalf(
			"unexpected order after rebalance before 0|0: %v, %v, %v",
			doneTasks[0].ID,
			doneTasks[1].ID,
			doneTasks[2].ID,
		)
	}
}

func TestRebuildCacheRebalancesAllRanks(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	sqliteCache, err := cache.NewSQLiteCache(filepath.Join(tempDir, ".local_cache.db"))
	if err != nil {
		t.Fatalf("failed to create sqlite cache: %v", err)
	}
	defer func() { _ = sqliteCache.Close() }()
	store.SetCache(sqliteCache)

	t1 := &model.Task{Title: "D1", ColumnID: "col-done", Rank: "0|a", Content: "Content D1"}
	t2 := &model.Task{Title: "D2", ColumnID: "col-done", Rank: "0|aa", Content: "Content D2"}
	t3 := &model.Task{Title: "D3", ColumnID: "col-done", Rank: "0|aam", Content: "Content D3"}
	t4 := &model.Task{Title: "D4", ColumnID: "col-done", Rank: "0|aam", Content: "Content D4"}
	t5 := &model.Task{Title: "T1", ColumnID: "col-todo", Rank: "0|lum", Content: "Content T1"}

	for _, task := range []*model.Task{t1, t2, t3, t4, t5} {
		if err := store.SaveTask(task); err != nil {
			t.Fatalf("failed to save task %s: %v", task.Title, err)
		}
	}
	t1UpdatedBefore := t1.UpdatedAt

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	req := httptest.NewRequest("POST", "/api/rebuild", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /api/rebuild failed with %d: %s", w.Code, w.Body.String())
	}

	doneTasks, err := store.GetTasksByColumnID("col-done")
	if err != nil {
		t.Fatalf("GetTasksByColumnID failed: %v", err)
	}
	if len(doneTasks) != 4 {
		t.Fatalf("expected 4 tasks in col-done, got %d", len(doneTasks))
	}

	// Verify all ranks are strictly increasing, unique, and 6-char fixed-width Base36 ("0|xxxxxx")
	for i, task := range doneTasks {
		if len(task.Rank) != 8 || !strings.HasPrefix(task.Rank, "0|") {
			t.Errorf("task[%d] expected 6-char base36 rank with 0| prefix, got %q", i, task.Rank)
		}
		if i > 0 && doneTasks[i-1].Rank >= task.Rank {
			t.Errorf(
				"expected strictly ascending ranks, got %q >= %q",
				doneTasks[i-1].Rank,
				task.Rank,
			)
		}
	}

	// Verify original order for distinct ranks (t1, t2 before t3/t4)
	if doneTasks[0].ID != t1.ID || doneTasks[1].ID != t2.ID {
		t.Fatalf("expected t1, t2 at head, got %s, %s", doneTasks[0].ID, doneTasks[1].ID)
	}

	// Verify Markdown body and UpdatedAt were preserved on disk
	allDisk, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("GetAllTasks failed: %v", err)
	}
	for _, task := range allDisk {
		if task.ID == t1.ID {
			if task.Content != "Content D1" {
				t.Errorf("expected Content D1 preserved, got %q", task.Content)
			}
			if !task.UpdatedAt.Equal(t1UpdatedBefore) {
				t.Errorf(
					"expected UpdatedAt preserved (%v vs %v)",
					task.UpdatedAt,
					t1UpdatedBefore,
				)
			}
		}
	}

	// Verify moving t5 from col-todo to top of col-done puts it at index 0
	moveBody, _ := json.Marshal(map[string]any{
		"column_id": "col-done",
		"prev_id":   "",
		"next_id":   doneTasks[0].ID,
	})
	moveReq := httptest.NewRequest("PUT", "/api/tasks/"+t5.ID, bytes.NewReader(moveBody))
	moveW := httptest.NewRecorder()
	mux.ServeHTTP(moveW, moveReq)
	if moveW.Code != http.StatusOK {
		t.Fatalf("PUT move failed with %d: %s", moveW.Code, moveW.Body.String())
	}

	afterMove, err := store.GetTasksByColumnID("col-done")
	if err != nil {
		t.Fatalf("GetTasksByColumnID after move failed: %v", err)
	}
	if len(afterMove) != 5 || afterMove[0].ID != t5.ID || afterMove[1].ID != t1.ID {
		t.Fatalf("expected t5 at index 0 before t1, got %v", afterMove)
	}
}

func TestCustomFieldsReorderPersistence(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	sqliteCache, err := cache.NewSQLiteCache(filepath.Join(tempDir, ".local_cache.db"))
	if err != nil {
		t.Fatalf("failed to create sqlite cache: %v", err)
	}
	defer func() { _ = sqliteCache.Close() }()
	store.SetCache(sqliteCache)

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. Reorder preset custom fields via PUT /api/config
	cfg, err := store.GetBoardConfig()
	if err != nil {
		t.Fatalf("GetBoardConfig failed: %v", err)
	}
	cfg.CustomFields = []model.CustomFieldDef{
		{ID: "preset-1", Name: "Priority", Type: model.FieldTypeDropdown},
		{ID: "preset-2", Name: "Assignee", Type: model.FieldTypeText},
		{ID: "preset-3", Name: "Due Date", Type: model.FieldTypeDate},
	}
	cfgBytes, _ := json.Marshal(cfg)
	reqPutCfg := httptest.NewRequest("PUT", "/api/config", bytes.NewReader(cfgBytes))
	wPutCfg := httptest.NewRecorder()
	mux.ServeHTTP(wPutCfg, reqPutCfg)
	if wPutCfg.Code != http.StatusOK {
		t.Fatalf("expected 200 PUT /api/config, got %d", wPutCfg.Code)
	}

	cfg.CustomFields = []model.CustomFieldDef{
		cfg.CustomFields[2],
		cfg.CustomFields[0],
		cfg.CustomFields[1],
	}
	reorderedCfgBytes, _ := json.Marshal(cfg)
	reqPutCfg2 := httptest.NewRequest("PUT", "/api/config", bytes.NewReader(reorderedCfgBytes))
	wPutCfg2 := httptest.NewRecorder()
	mux.ServeHTTP(wPutCfg2, reqPutCfg2)
	if wPutCfg2.Code != http.StatusOK {
		t.Fatalf("expected 200 PUT /api/config reorder, got %d", wPutCfg2.Code)
	}

	reqGetCfg := httptest.NewRequest("GET", "/api/config", nil)
	wGetCfg := httptest.NewRecorder()
	mux.ServeHTTP(wGetCfg, reqGetCfg)
	var loadedCfg model.BoardConfig
	if err := json.NewDecoder(wGetCfg.Body).Decode(&loadedCfg); err != nil {
		t.Fatalf("failed to decode config: %v", err)
	}
	expectedPresetOrder := []string{"preset-3", "preset-1", "preset-2"}
	if len(loadedCfg.CustomFields) != len(expectedPresetOrder) {
		t.Fatalf(
			"expected %d preset custom fields, got %d",
			len(expectedPresetOrder),
			len(loadedCfg.CustomFields),
		)
	}
	for i, wantID := range expectedPresetOrder {
		if loadedCfg.CustomFields[i].ID != wantID {
			t.Errorf(
				"config custom_fields[%d]: want %q, got %q",
				i,
				wantID,
				loadedCfg.CustomFields[i].ID,
			)
		}
	}

	// 2. Create task with 3 custom fields, then reorder them via PUT /api/tasks/{id}
	initialFields := []model.CustomFieldValue{
		{ID: "cf-1", Name: "Priority", Type: model.FieldTypeText, Value: "High", Enabled: true},
		{ID: "cf-2", Name: "Assignee", Type: model.FieldTypeText, Value: "Alice", Enabled: true},
		{
			ID:      "cf-3",
			Name:    "Due Date",
			Type:    model.FieldTypeDate,
			Value:   "2026-12-01",
			Enabled: true,
		},
	}
	createPayload, _ := json.Marshal(map[string]any{
		"title":         "Reorder Fields Task",
		"column_id":     "col-todo",
		"custom_fields": initialFields,
	})
	reqCreate := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(createPayload))
	wCreate := httptest.NewRecorder()
	mux.ServeHTTP(wCreate, reqCreate)
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 POST /api/tasks, got %d", wCreate.Code)
	}
	var createdTask model.Task
	if err := json.NewDecoder(wCreate.Body).Decode(&createdTask); err != nil {
		t.Fatalf("failed to decode created task: %v", err)
	}

	reorderedFields := []model.CustomFieldValue{
		initialFields[2],
		initialFields[0],
		initialFields[1],
	}
	updatePayload, _ := json.Marshal(map[string]any{
		"custom_fields": reorderedFields,
	})
	reqUpdate := httptest.NewRequest(
		"PUT",
		"/api/tasks/"+createdTask.ID,
		bytes.NewReader(updatePayload),
	)
	wUpdate := httptest.NewRecorder()
	mux.ServeHTTP(wUpdate, reqUpdate)
	if wUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 PUT /api/tasks/{id}, got %d", wUpdate.Code)
	}

	expectedFieldOrder := []string{"cf-3", "cf-1", "cf-2"}

	// Verify via GET /api/tasks/{id} (SQLite cache)
	reqGetOne := httptest.NewRequest("GET", "/api/tasks/"+createdTask.ID, nil)
	wGetOne := httptest.NewRecorder()
	mux.ServeHTTP(wGetOne, reqGetOne)
	var loadedTask model.Task
	if err := json.NewDecoder(wGetOne.Body).Decode(&loadedTask); err != nil {
		t.Fatalf("failed to decode task: %v", err)
	}
	if len(loadedTask.CustomFields) != len(expectedFieldOrder) {
		t.Fatalf(
			"expected %d task custom fields, got %d",
			len(expectedFieldOrder),
			len(loadedTask.CustomFields),
		)
	}
	for i, wantID := range expectedFieldOrder {
		if loadedTask.CustomFields[i].ID != wantID {
			t.Errorf(
				"GET /api/tasks/{id} custom_fields[%d]: want %q, got %q",
				i,
				wantID,
				loadedTask.CustomFields[i].ID,
			)
		}
	}

	// Verify via GET /api/tasks (board list)
	reqGetAll := httptest.NewRequest("GET", "/api/tasks", nil)
	wGetAll := httptest.NewRecorder()
	mux.ServeHTTP(wGetAll, reqGetAll)
	var listTasks []*model.Task
	if err := json.NewDecoder(wGetAll.Body).Decode(&listTasks); err != nil {
		t.Fatalf("failed to decode task list: %v", err)
	}
	if len(listTasks) != 1 || len(listTasks[0].CustomFields) != len(expectedFieldOrder) {
		t.Fatalf(
			"expected 1 task with %d custom fields, got %+v",
			len(expectedFieldOrder),
			listTasks,
		)
	}
	for i, wantID := range expectedFieldOrder {
		if listTasks[0].CustomFields[i].ID != wantID {
			t.Errorf(
				"GET /api/tasks custom_fields[%d]: want %q, got %q",
				i,
				wantID,
				listTasks[0].CustomFields[i].ID,
			)
		}
	}

	// Verify directly from Markdown file on disk
	diskTasks, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("GetAllTasks failed: %v", err)
	}
	if len(diskTasks) != 1 || len(diskTasks[0].CustomFields) != len(expectedFieldOrder) {
		t.Fatalf("expected 1 disk task with %d custom fields", len(expectedFieldOrder))
	}
	for i, wantID := range expectedFieldOrder {
		if diskTasks[0].CustomFields[i].ID != wantID {
			t.Errorf(
				"disk custom_fields[%d]: want %q, got %q",
				i,
				wantID,
				diskTasks[0].CustomFields[i].ID,
			)
		}
	}
}

func TestGetTasksSearchCustomFields(t *testing.T) {
	runSearchCases := func(t *testing.T, mode string) {
		t.Helper()
		tempDir := t.TempDir()
		store, err := markdown.NewStore(tempDir)
		if err != nil {
			t.Fatalf("failed to create store: %v", err)
		}

		var engine *search.Engine
		switch mode {
		case "sqlite":
			sqliteCache, err := cache.NewSQLiteCache(filepath.Join(tempDir, ".local_cache.db"))
			if err != nil {
				t.Fatalf("failed to create sqlite cache: %v", err)
			}
			defer func() { _ = sqliteCache.Close() }()
			store.SetCache(sqliteCache)
			engine = search.NewEngine(sqliteCache)
		case "unavailable":
			engine = search.NewEngine(nil)
		}

		parentTask := &model.Task{
			Title:    "親タスク",
			ColumnID: "col-todo",
			Rank:     "0|a",
			CustomFields: []model.CustomFieldValue{
				{
					ID:    "cf-priority",
					Name:  "優先度",
					Type:  model.FieldTypeDropdown,
					Value: "高",
					Options: []model.CustomFieldOption{
						{ID: "opt-1", Value: "高"},
						{ID: "opt-2", Value: "低"},
					},
					Enabled: true,
				},
				{
					ID:      "cf-hidden",
					Name:    "非公開メモ",
					Type:    model.FieldTypeText,
					Value:   "非表示テキスト",
					Enabled: false,
				},
			},
		}
		if err := store.SaveTask(parentTask); err != nil {
			t.Fatalf("failed to save parentTask: %v", err)
		}

		subTask := &model.Task{
			ParentID: parentTask.ID,
			Title:    "子タスク",
			ColumnID: "col-todo",
			Rank:     "0|b",
			CustomFields: []model.CustomFieldValue{
				{
					ID:      "cf-sub-link",
					Name:    "仕様書",
					Type:    model.FieldTypeLink,
					Value:   "https://example.com/subtask-spec",
					Enabled: true,
				},
			},
		}
		if err := store.SaveTask(subTask); err != nil {
			t.Fatalf("failed to save subTask: %v", err)
		}
		parentTask.Subtasks = []model.SubtaskRef{{ID: subTask.ID, Completed: false}}
		if err := store.SaveTask(parentTask); err != nil {
			t.Fatalf("failed to update parentTask subtasks: %v", err)
		}

		otherTask := &model.Task{
			Title:    "別タスク",
			ColumnID: "col-in-progress",
			Rank:     "0|c",
			CustomFields: []model.CustomFieldValue{
				{
					ID:      "cf-date",
					Name:    "期限",
					Type:    model.FieldTypeDate,
					Value:   "2026-12-31",
					Enabled: true,
				},
			},
		}
		if err := store.SaveTask(otherTask); err != nil {
			t.Fatalf("failed to save otherTask: %v", err)
		}

		server := NewServer(store, engine)
		mux := http.NewServeMux()
		server.RegisterRoutes(mux)

		queryTasks := func(q string) []*model.Task {
			req := httptest.NewRequest("GET", "/api/tasks?q="+url.QueryEscape(q), nil)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("GET /api/tasks?q=%s returned %d", q, w.Code)
			}
			var tasks []*model.Task
			if err := json.NewDecoder(w.Body).Decode(&tasks); err != nil {
				t.Fatalf("failed to decode tasks for query %q: %v", q, err)
			}
			return tasks
		}

		// 1. Short dropdown value matches parentTask
		resHigh := queryTasks("高")
		if len(resHigh) != 1 || resHigh[0].ID != parentTask.ID {
			t.Errorf("query '高': expected parentTask, got %+v", resHigh)
		}

		// 2. Unselected dropdown option does not match
		resLow := queryTasks("低")
		if len(resLow) != 0 {
			t.Errorf("query '低': expected 0 tasks, got %+v", resLow)
		}

		// 3. Disabled custom field does not match
		resHidden := queryTasks("非表示テキスト")
		if len(resHidden) != 0 {
			t.Errorf("query '非表示テキスト': expected 0 tasks, got %+v", resHidden)
		}

		// 4. Date custom field matches otherTask
		resDate := queryTasks("2026-12-31")
		if len(resDate) != 1 || resDate[0].ID != otherTask.ID {
			t.Errorf("query '2026-12-31': expected otherTask, got %+v", resDate)
		}

		// 5. Subtask custom field match surfaces parentTask
		resSub := queryTasks("subtask-spec")
		if len(resSub) != 1 || resSub[0].ID != parentTask.ID {
			t.Errorf("query 'subtask-spec': expected parentTask, got %+v", resSub)
		}
	}

	t.Run("with_search_engine", func(t *testing.T) {
		runSearchCases(t, "sqlite")
	})
	t.Run("without_search_engine_fallback", func(t *testing.T) {
		runSearchCases(t, "nil")
	})
	t.Run("with_unavailable_search_engine_fallback", func(t *testing.T) {
		runSearchCases(t, "unavailable")
	})
}

func TestPartialUpdateWithCachePreservesContentAndWhitespaceSearch(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	sqliteCache, err := cache.NewSQLiteCache(filepath.Join(tempDir, ".local_cache.db"))
	if err != nil {
		t.Fatalf("failed to create sqlite cache: %v", err)
	}
	defer func() { _ = sqliteCache.Close() }()
	store.SetCache(sqliteCache)

	task := &model.Task{
		Title:    "Keep Body Card",
		ColumnID: "col-todo",
		Rank:     "0|i0000i",
		Content:  "## Body\nDo not erase this content on drag-and-drop!",
	}
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task: %v", err)
	}

	server := NewServer(store, search.NewEngine(sqliteCache))
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. GET /api/tasks/{id} must return full Content even with SQLite cache enabled
	reqDetail := httptest.NewRequest("GET", "/api/tasks/"+task.ID, nil)
	wDetail := httptest.NewRecorder()
	mux.ServeHTTP(wDetail, reqDetail)
	if wDetail.Code != http.StatusOK {
		t.Fatalf("GET /api/tasks/{id} failed with %d", wDetail.Code)
	}
	var detail model.Task
	if err := json.NewDecoder(wDetail.Body).Decode(&detail); err != nil {
		t.Fatalf("failed to decode detail: %v", err)
	}
	if detail.Content != task.Content {
		t.Fatalf(
			"expected full content %q from GET /api/tasks/{id}, got %q",
			task.Content,
			detail.Content,
		)
	}

	// 2. PUT /api/tasks/{id} with only column_id (like card drag) must preserve Content on disk
	moveBody, _ := json.Marshal(map[string]any{"column_id": "col-done"})
	reqMove := httptest.NewRequest("PUT", "/api/tasks/"+task.ID, bytes.NewReader(moveBody))
	wMove := httptest.NewRecorder()
	mux.ServeHTTP(wMove, reqMove)
	if wMove.Code != http.StatusOK {
		t.Fatalf("PUT /api/tasks/{id} failed with %d: %s", wMove.Code, wMove.Body.String())
	}

	reloaded, err := store.GetTaskByID(task.ID)
	if err != nil {
		t.Fatalf("GetTaskByID failed: %v", err)
	}
	if reloaded.Content != task.Content {
		t.Fatalf(
			"expected content preserved after column move: want %q, got %q",
			task.Content,
			reloaded.Content,
		)
	}

	// 3. GET /api/tasks?q=%20%20%20 (whitespace only) must return all tasks
	reqSpace := httptest.NewRequest("GET", "/api/tasks?q=%20%20%20", nil)
	wSpace := httptest.NewRecorder()
	mux.ServeHTTP(wSpace, reqSpace)
	if wSpace.Code != http.StatusOK {
		t.Fatalf("GET /api/tasks?q=spaces failed with %d", wSpace.Code)
	}
	var spaceResults []*model.Task
	if err := json.NewDecoder(wSpace.Body).Decode(&spaceResults); err != nil {
		t.Fatalf("failed to decode tasks: %v", err)
	}
	if len(spaceResults) != 1 || spaceResults[0].ID != task.ID {
		t.Fatalf("expected whitespace-only query to return all tasks, got %+v", spaceResults)
	}
}

func TestSubtaskEmptyColumnBehavior(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := markdown.NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	server := NewServer(store, nil)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. Root task without column_id returns 400 Bad Request
	rootNoColBody, _ := json.Marshal(map[string]any{"title": "No Column Root"})
	reqRootNoCol := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(rootNoColBody))
	wRootNoCol := httptest.NewRecorder()
	mux.ServeHTTP(wRootNoCol, reqRootNoCol)
	if wRootNoCol.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for root task without column_id, got %d", wRootNoCol.Code)
	}

	// 2. Create parent task with explicit column_id
	parentBody, _ := json.Marshal(map[string]any{
		"title":     "Parent Card",
		"column_id": "col-todo",
	})
	reqParent := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(parentBody))
	wParent := httptest.NewRecorder()
	mux.ServeHTTP(wParent, reqParent)
	if wParent.Code != http.StatusCreated {
		t.Fatalf("expected 201 for parent, got %d", wParent.Code)
	}
	var parent model.Task
	_ = json.NewDecoder(wParent.Body).Decode(&parent)

	// 3. Create subtask without column_id -> succeeds with empty column_id
	subBody, _ := json.Marshal(map[string]any{
		"parent_id": parent.ID,
		"title":     "UniqueEmptyColSubtask",
	})
	reqSub := httptest.NewRequest("POST", "/api/tasks", bytes.NewReader(subBody))
	wSub := httptest.NewRecorder()
	mux.ServeHTTP(wSub, reqSub)
	if wSub.Code != http.StatusCreated {
		t.Fatalf(
			"expected 201 for subtask without column_id, got %d: %s",
			wSub.Code,
			wSub.Body.String(),
		)
	}
	var sub model.Task
	_ = json.NewDecoder(wSub.Body).Decode(&sub)
	if sub.ColumnID != "" {
		t.Fatalf("expected empty column_id for subtask, got %q", sub.ColumnID)
	}

	// 4. GET /api/tasks returns parent with subtask attached (and subtask not as root)
	reqList := httptest.NewRequest("GET", "/api/tasks", nil)
	wList := httptest.NewRecorder()
	mux.ServeHTTP(wList, reqList)
	if wList.Code != http.StatusOK {
		t.Fatalf("expected 200 GET /api/tasks, got %d", wList.Code)
	}
	var list []*model.Task
	_ = json.NewDecoder(wList.Body).Decode(&list)
	if len(list) != 1 || list[0].ID != parent.ID || list[0].SubtasksCount != 1 {
		t.Fatalf("unexpected task list: %+v", list)
	}

	// 5. Fallback search (no FTS) still finds parent via empty-column subtask title
	reqSearch := httptest.NewRequest("GET", "/api/tasks?q=UniqueEmptyColSubtask", nil)
	wSearch := httptest.NewRecorder()
	mux.ServeHTTP(wSearch, reqSearch)
	if wSearch.Code != http.StatusOK {
		t.Fatalf("expected 200 GET /api/tasks?q=..., got %d", wSearch.Code)
	}
	var searchList []*model.Task
	_ = json.NewDecoder(wSearch.Body).Decode(&searchList)
	if len(searchList) != 1 || searchList[0].ID != parent.ID {
		t.Fatalf("expected search to match parent via empty-column subtask, got %+v", searchList)
	}

	// 6. Unlink subtask with explicit column_id -> appears on board as standalone card
	unlinkBody, _ := json.Marshal(map[string]any{
		"parent_id": "",
		"column_id": "col-in-progress",
	})
	reqUnlink := httptest.NewRequest("PUT", "/api/tasks/"+sub.ID, bytes.NewReader(unlinkBody))
	wUnlink := httptest.NewRecorder()
	mux.ServeHTTP(wUnlink, reqUnlink)
	if wUnlink.Code != http.StatusOK {
		t.Fatalf("expected 200 PUT unlink, got %d", wUnlink.Code)
	}

	reqListAfter := httptest.NewRequest("GET", "/api/tasks", nil)
	wListAfter := httptest.NewRecorder()
	mux.ServeHTTP(wListAfter, reqListAfter)
	var listAfter []*model.Task
	_ = json.NewDecoder(wListAfter.Body).Decode(&listAfter)
	if len(listAfter) != 2 {
		t.Fatalf("expected 2 root tasks after unlink with column_id, got %d", len(listAfter))
	}
}
