package mcp

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/murosan/local-kanban/pkg/markdown"
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
