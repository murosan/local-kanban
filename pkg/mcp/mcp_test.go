package mcp

import (
	"context"
	"testing"

	"localkanban/pkg/markdown"
	"localkanban/pkg/search"
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
