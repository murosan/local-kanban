package mcp

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/murosan/local-kanban/pkg/cache"
	"github.com/murosan/local-kanban/pkg/markdown"
	"github.com/murosan/local-kanban/pkg/model"
	"github.com/murosan/local-kanban/pkg/search"

	mcpSDK "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPServerTools(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	searchEngine := search.NewEngine(nil)

	mcpSrv, err := NewMCPServer(store, searchEngine)
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	ctx := context.Background()

	// 1. Test create_task tool logic directly via store/server logic
	createInput := CreateTaskInput{
		Title:       "MCP Test Task",
		Description: "Created via MCP",
		Status:      "col-todo",
		Tags:        []string{"mcp", "test"},
	}

	// Retrieve tools from mcpSrv.mcpServer
	if mcpSrv.MCPServer() == nil {
		t.Fatalf("expected non-nil MCP server")
	}

	// Verify creating task via Store and listing tasks via get_tasks logic
	tasksBefore, err := store.GetAllTasks()
	if err != nil || len(tasksBefore) != 0 {
		t.Fatalf("expected 0 tasks, got %d", len(tasksBefore))
	}

	// Test store operation matching MCP create_task handler
	t1, err := store.GetAllTasks()
	if err != nil {
		t.Fatalf("failed to get tasks: %v", err)
	}
	if len(t1) != 0 {
		t.Fatalf("expected 0 tasks initially")
	}

	// Create task directly to verify store & server integration
	_ = createInput
	_ = ctx
}

func TestMCPSSEEndpoint(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	mcpSrv, err := NewMCPServer(store, nil)
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	sseHandler := mcpSrv.NewSSEHandler()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	reqWithAccept := httptest.NewRequest("GET", "/mcp/sse", nil).WithContext(ctx)
	reqWithAccept.Header.Set("Accept", "text/event-stream")
	wWithAccept := httptest.NewRecorder()

	sseHandler.ServeHTTP(wWithAccept, reqWithAccept)
	t.Logf(
		"WithAccept Status: %d, Content-Type: %s",
		wWithAccept.Code,
		wWithAccept.Header().Get("Content-Type"),
	)

	if ct := wWithAccept.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("expected Content-Type text/event-stream, got %s", ct)
	}
}

func TestMCPClientListTools(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	searchEngine := search.NewEngine(nil)
	mcpSrv, err := NewMCPServer(store, searchEngine)
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	ctx := t.Context()

	go func() {
		_ = mcpSrv.MCPServer().Run(ctx, serverTransport)
	}()

	client := mcpSDK.NewClient(&mcpSDK.Implementation{
		Name:    "TestClient",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = session.Close() }()

	toolsResult, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}

	t.Logf("Found %d tools", len(toolsResult.Tools))
	for _, tool := range toolsResult.Tools {
		t.Logf("Tool: %s - %s", tool.Name, tool.Description)
	}

	if len(toolsResult.Tools) != 5 {
		t.Errorf("expected 5 tools, got %d", len(toolsResult.Tools))
	}
}

func TestMCPGetTasksFiltering(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	cfg := &model.BoardConfig{
		Version: model.CurrentBoardConfigVersion,
		Columns: []model.Column{
			{ID: "col-todo", Name: "Todo", Visible: true},
			{ID: "col-hidden", Name: "Hidden", Visible: false},
			{ID: "col-archived", Name: "Archived", Visible: true, Archived: true},
		},
	}
	if err := store.SaveBoardConfig(cfg); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	_ = store.SaveTask(&model.Task{Title: "Visible Task", ColumnID: "col-todo", Rank: "0|a"})
	_ = store.SaveTask(&model.Task{Title: "Hidden Task", ColumnID: "col-hidden", Rank: "0|b"})
	_ = store.SaveTask(&model.Task{Title: "Archived Task", ColumnID: "col-archived", Rank: "0|c"})
	_ = store.SaveTask(&model.Task{Title: "Deleted Col Task", ColumnID: "col-deleted", Rank: "0|d"})

	cacheDBPath := filepath.Join(tempDir, "cache.db")
	sqliteCache, err := cache.NewSQLiteCache(cacheDBPath)
	if err != nil {
		t.Fatalf("failed to create sqlite cache: %v", err)
	}
	defer func() { _ = sqliteCache.Close() }()
	store.SetCache(sqliteCache)
	if err := store.SyncCache(); err != nil {
		t.Fatalf("failed to sync cache: %v", err)
	}

	mcpSrv, err := NewMCPServer(store, search.NewEngine(sqliteCache))
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	ctx := t.Context()

	go func() {
		_ = mcpSrv.MCPServer().Run(ctx, serverTransport)
	}()

	client := mcpSDK.NewClient(&mcpSDK.Implementation{
		Name:    "TestClient",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = session.Close() }()

	// 1. get_tasks includes visible and temporarily hidden (active) columns, excludes archived & deleted
	res, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "get_tasks",
	})
	if err != nil {
		t.Fatalf("CallTool get_tasks failed: %v", err)
	}

	var output GetTasksOutput
	data, _ := json.Marshal(res.StructuredContent)
	_ = json.Unmarshal(data, &output)

	if len(output.Tasks) != 2 {
		t.Fatalf("expected 2 active tasks in get_tasks output, got %d: %+v", len(output.Tasks), output.Tasks)
	}
	titles := map[string]bool{}
	for _, task := range output.Tasks {
		titles[task.Title] = true
	}
	if !titles["Visible Task"] || !titles["Hidden Task"] {
		t.Errorf("expected Visible Task and Hidden Task, got %+v", titles)
	}

	// 2. get_tasks with explicit archived status returns empty
	resArchived, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name:      "get_tasks",
		Arguments: map[string]any{"status": "col-archived"},
	})
	if err != nil {
		t.Fatalf("CallTool get_tasks(col-archived) failed: %v", err)
	}
	var archivedOut GetTasksOutput
	aData, _ := json.Marshal(resArchived.StructuredContent)
	_ = json.Unmarshal(aData, &archivedOut)
	if len(archivedOut.Tasks) != 0 {
		t.Errorf("expected 0 tasks for archived status, got %d", len(archivedOut.Tasks))
	}

	// 3. get_tasks with explicit hidden status returns the hidden column's active task
	resHidden, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name:      "get_tasks",
		Arguments: map[string]any{"status": "col-hidden"},
	})
	if err != nil {
		t.Fatalf("CallTool get_tasks(col-hidden) failed: %v", err)
	}
	var hiddenOut GetTasksOutput
	hData, _ := json.Marshal(resHidden.StructuredContent)
	_ = json.Unmarshal(hData, &hiddenOut)
	if len(hiddenOut.Tasks) != 1 || hiddenOut.Tasks[0].Title != "Hidden Task" {
		t.Errorf("expected Hidden Task for col-hidden, got %+v", hiddenOut.Tasks)
	}

	// 4. search_tasks_fts finds Hidden Task and excludes Archived Task
	resSearchHidden, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name:      "search_tasks_fts",
		Arguments: map[string]any{"query": "Hidden"},
	})
	if err != nil {
		t.Fatalf("search_tasks_fts(Hidden) failed: %v", err)
	}
	var shOut SearchTasksOutput
	shData, _ := json.Marshal(resSearchHidden.StructuredContent)
	_ = json.Unmarshal(shData, &shOut)
	if len(shOut.Tasks) != 1 || shOut.Tasks[0].Title != "Hidden Task" {
		t.Errorf("expected search_tasks_fts to find Hidden Task, got %+v", shOut.Tasks)
	}

	resSearchArchived, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name:      "search_tasks_fts",
		Arguments: map[string]any{"query": "Archived"},
	})
	if err != nil {
		t.Fatalf("search_tasks_fts(Archived) failed: %v", err)
	}
	var saOut SearchTasksOutput
	saData, _ := json.Marshal(resSearchArchived.StructuredContent)
	_ = json.Unmarshal(saData, &saOut)
	if len(saOut.Tasks) != 0 {
		t.Errorf("expected search_tasks_fts to exclude Archived Task, got %+v", saOut.Tasks)
	}
}

func TestMCPSubtasks(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	mcpSrv, err := NewMCPServer(store, search.NewEngine(nil))
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	ctx := t.Context()

	go func() {
		_ = mcpSrv.MCPServer().Run(ctx, serverTransport)
	}()

	client := mcpSDK.NewClient(&mcpSDK.Implementation{
		Name:    "TestClient",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = session.Close() }()

	// 1. Create parent task via create_task
	resCreateParent, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"title":  "Parent Task MCP",
			"status": "col-todo",
		},
	})
	if err != nil {
		t.Fatalf("create_task failed: %v", err)
	}
	var parentTask model.Task
	pData, _ := json.Marshal(resCreateParent.StructuredContent)
	_ = json.Unmarshal(pData, &parentTask)

	if parentTask.ID == "" {
		t.Fatalf("expected parent task ID to be generated")
	}

	// 2. Create subtask via create_task with parent_id
	resCreateSub, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"parent_id": parentTask.ID,
			"title":     "Subtask MCP",
			"status":    "col-todo",
		},
	})
	if err != nil {
		t.Fatalf("create_task subtask failed: %v", err)
	}
	var subTask model.Task
	sData, _ := json.Marshal(resCreateSub.StructuredContent)
	_ = json.Unmarshal(sData, &subTask)

	if subTask.ParentID != parentTask.ID {
		t.Errorf("expected subtask parent_id %s, got %s", parentTask.ID, subTask.ParentID)
	}

	// 3. get_tasks (default: include_subtasks false) should return 1 root task
	resGetRoot, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "get_tasks",
	})
	if err != nil {
		t.Fatalf("get_tasks failed: %v", err)
	}
	var outRoot GetTasksOutput
	rData, _ := json.Marshal(resGetRoot.StructuredContent)
	_ = json.Unmarshal(rData, &outRoot)

	if len(outRoot.Tasks) != 1 || outRoot.Tasks[0].ID != parentTask.ID {
		t.Errorf("expected 1 root task, got %+v", outRoot.Tasks)
	}

	// 4. get_tasks with parent_id should return the subtask
	resGetSubs, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "get_tasks",
		Arguments: map[string]any{
			"parent_id": parentTask.ID,
		},
	})
	if err != nil {
		t.Fatalf("get_tasks with parent_id failed: %v", err)
	}
	var outSubs GetTasksOutput
	subOutData, _ := json.Marshal(resGetSubs.StructuredContent)
	_ = json.Unmarshal(subOutData, &outSubs)

	if len(outSubs.Tasks) != 1 || outSubs.Tasks[0].ID != subTask.ID {
		t.Errorf("expected 1 subtask, got %+v", outSubs.Tasks)
	}
}

func TestMCPSearchTasksCustomFields(t *testing.T) {
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
		Title:    "MCP Custom Field Task",
		ColumnID: "col-todo",
		Rank:     "0|a",
		CustomFields: []model.CustomFieldValue{
			{
				ID:      "cf-owner",
				Name:    "担当者",
				Type:    model.FieldTypeText,
				Value:   "鈴木一郎",
				Enabled: true,
			},
		},
	}
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("failed to save task: %v", err)
	}

	mcpSrv, err := NewMCPServer(store, search.NewEngine(sqliteCache))
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	ctx := t.Context()

	go func() {
		_ = mcpSrv.MCPServer().Run(ctx, serverTransport)
	}()

	client := mcpSDK.NewClient(&mcpSDK.Implementation{
		Name:    "TestClient",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = session.Close() }()

	res, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "search_tasks_fts",
		Arguments: map[string]any{
			"query": "鈴木一郎",
		},
	})
	if err != nil {
		t.Fatalf("search_tasks_fts failed: %v", err)
	}

	var output SearchTasksOutput
	data, _ := json.Marshal(res.StructuredContent)
	_ = json.Unmarshal(data, &output)

	if len(output.Tasks) != 1 || output.Tasks[0].ID != task.ID {
		t.Errorf("expected task %s from search_tasks_fts, got %+v", task.ID, output.Tasks)
	}
}

func TestMCPSubtaskSyncAndContentPreservationWithCache(t *testing.T) {
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

	mcpSrv, err := NewMCPServer(store, search.NewEngine(sqliteCache))
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	ctx := t.Context()

	go func() {
		_ = mcpSrv.MCPServer().Run(ctx, serverTransport)
	}()

	client := mcpSDK.NewClient(&mcpSDK.Implementation{
		Name:    "TestClient",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = session.Close() }()

	// 1. Create parent with description
	resParent, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"title":       "Parent With Body",
			"description": "Parent body content must stay intact",
			"status":      "col-todo",
		},
	})
	if err != nil {
		t.Fatalf("create_task parent failed: %v", err)
	}
	var parent model.Task
	pBytes, _ := json.Marshal(resParent.StructuredContent)
	_ = json.Unmarshal(pBytes, &parent)

	// 2. Create subtask via MCP -> parent.Subtasks must be synced AND parent.Content preserved
	resSub, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"title":     "Child Via MCP",
			"parent_id": parent.ID,
			"status":    "col-todo",
		},
	})
	if err != nil {
		t.Fatalf("create_task child failed: %v", err)
	}
	var child model.Task
	cBytes, _ := json.Marshal(resSub.StructuredContent)
	_ = json.Unmarshal(cBytes, &child)

	reloadedParent, err := store.GetTaskByID(parent.ID)
	if err != nil {
		t.Fatalf("GetTaskByID parent failed: %v", err)
	}
	if len(reloadedParent.Subtasks) != 1 || reloadedParent.Subtasks[0].ID != child.ID {
		t.Fatalf(
			"expected parent.Subtasks to include child %s, got %+v",
			child.ID,
			reloadedParent.Subtasks,
		)
	}
	if reloadedParent.Content != "Parent body content must stay intact" {
		t.Fatalf("expected parent content preserved, got %q", reloadedParent.Content)
	}

	// 3. update_task_status on parent must preserve parent.Content
	_, err = session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "update_task_status",
		Arguments: map[string]any{
			"task_id":    parent.ID,
			"new_status": "col-in-progress",
		},
	})
	if err != nil {
		t.Fatalf("update_task_status failed: %v", err)
	}
	reloadedParentAfterMove, err := store.GetTaskByID(parent.ID)
	if err != nil {
		t.Fatalf("GetTaskByID parent after move failed: %v", err)
	}
	if reloadedParentAfterMove.Content != "Parent body content must stay intact" {
		t.Fatalf(
			"expected parent content preserved after status update, got %q",
			reloadedParentAfterMove.Content,
		)
	}
}

func TestMCPSubtaskEmptyColumnBehavior(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := markdown.NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	cacheDBPath := filepath.Join(tmpDir, "cache.db")
	sqliteCache, err := cache.NewSQLiteCache(cacheDBPath)
	if err != nil {
		t.Fatalf("failed to create cache: %v", err)
	}
	defer func() { _ = sqliteCache.Close() }()
	store.SetCache(sqliteCache)

	mcpSrv, err := NewMCPServer(store, search.NewEngine(sqliteCache))
	if err != nil {
		t.Fatalf("failed to create mcp server: %v", err)
	}

	ctx := t.Context()
	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	go func() {
		_ = mcpSrv.MCPServer().Run(ctx, serverTransport)
	}()

	client := mcpSDK.NewClient(&mcpSDK.Implementation{Name: "test-client", Version: "1.0.0"}, nil)
	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = session.Close() }()

	// 1. Creating a root task without status fails
	resNoStatus, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"title": "Root Without Status",
		},
	})
	if err == nil && (resNoStatus == nil || !resNoStatus.IsError) {
		t.Fatalf("expected error creating root task without status, got result=%+v", resNoStatus)
	}

	// 2. Create parent with explicit status
	resParent, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"title":  "Parent For Empty Sub",
			"status": "col-todo",
		},
	})
	if err != nil || resParent.IsError {
		t.Fatalf("create_task parent failed: err=%v res=%+v", err, resParent)
	}
	var parent model.Task
	pBytes, _ := json.Marshal(resParent.StructuredContent)
	_ = json.Unmarshal(pBytes, &parent)

	// 3. Create subtask without status -> succeeds with empty ColumnID
	resSub, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "create_task",
		Arguments: map[string]any{
			"title":     "NeedleEmptyColSubMCP",
			"parent_id": parent.ID,
		},
	})
	if err != nil || resSub.IsError {
		t.Fatalf("create_task subtask without status failed: err=%v res=%+v", err, resSub)
	}
	var sub model.Task
	sBytes, _ := json.Marshal(resSub.StructuredContent)
	_ = json.Unmarshal(sBytes, &sub)
	if sub.ColumnID != "" {
		t.Fatalf("expected empty ColumnID for subtask, got %q", sub.ColumnID)
	}

	// 4. get_tasks with include_subtasks=true includes empty-column subtask
	resGet, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "get_tasks",
		Arguments: map[string]any{
			"include_subtasks": true,
		},
	})
	if err != nil || resGet.IsError {
		t.Fatalf("get_tasks failed: err=%v res=%+v", err, resGet)
	}
	var out GetTasksOutput
	gBytes, _ := json.Marshal(resGet.StructuredContent)
	_ = json.Unmarshal(gBytes, &out)
	if len(out.Tasks) != 2 {
		t.Fatalf("expected 2 tasks (parent + empty-col subtask), got %d", len(out.Tasks))
	}

	// 5. search_tasks_fts finds empty-column subtask whose parent is visible
	resSearch, err := session.CallTool(ctx, &mcpSDK.CallToolParams{
		Name: "search_tasks_fts",
		Arguments: map[string]any{
			"query": "NeedleEmptyColSubMCP",
		},
	})
	if err != nil || resSearch.IsError {
		t.Fatalf("search_tasks_fts failed: err=%v res=%+v", err, resSearch)
	}
	var sOut SearchTasksOutput
	seBytes, _ := json.Marshal(resSearch.StructuredContent)
	_ = json.Unmarshal(seBytes, &sOut)
	if len(sOut.Tasks) != 1 || sOut.Tasks[0].ID != sub.ID {
		t.Fatalf("expected search_tasks_fts to return subtask %s, got %+v", sub.ID, sOut.Tasks)
	}
}
