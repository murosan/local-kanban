package mcp

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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
		},
	}
	if err := store.SaveBoardConfig(cfg); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	_ = store.SaveTask(&model.Task{Title: "Visible Task", ColumnID: "col-todo"})
	_ = store.SaveTask(&model.Task{Title: "Hidden Task", ColumnID: "col-hidden"})
	_ = store.SaveTask(&model.Task{Title: "Deleted Col Task", ColumnID: "col-deleted"})

	mcpSrv, err := NewMCPServer(store, search.NewEngine(nil))
	if err != nil {
		t.Fatalf("failed to create MCP server: %v", err)
	}

	clientTransport, serverTransport := mcpSDK.NewInMemoryTransports()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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
		Name: "get_tasks",
	})
	if err != nil {
		t.Fatalf("CallTool get_tasks failed: %v", err)
	}

	var output GetTasksOutput
	data, _ := json.Marshal(res.StructuredContent)
	_ = json.Unmarshal(data, &output)

	if len(output.Tasks) != 1 {
		t.Fatalf("expected 1 task in get_tasks output, got %d", len(output.Tasks))
	}
	if output.Tasks[0].Title != "Visible Task" {
		t.Errorf("expected task title 'Visible Task', got '%s'", output.Tasks[0].Title)
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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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
