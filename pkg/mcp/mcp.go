package mcp

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"localkanban/pkg/lexorank"
	"localkanban/pkg/markdown"
	"localkanban/pkg/model"
	"localkanban/pkg/search"
)

type Server struct {
	mcpServer    *mcp.Server
	store        *markdown.Store
	searchEngine *search.Engine
}

type GetTasksInput struct {
	Status string `json:"status,omitempty" jsonschema:"Filter tasks by column status ID (e.g. col-todo, col-in-progress, col-done)"`
	Tag    string `json:"tag,omitempty" jsonschema:"Filter tasks by tag"`
	Limit  int    `json:"limit,omitempty" jsonschema:"Maximum number of tasks to return"`
}

type CreateTaskInput struct {
	Title       string   `json:"title" jsonschema:"Task title"`
	Description string   `json:"description,omitempty" jsonschema:"Task markdown description"`
	Status      string   `json:"status,omitempty" jsonschema:"Status column ID (defaults to col-todo)"`
	Tags        []string `json:"tags,omitempty" jsonschema:"Tags list"`
}

type UpdateTaskStatusInput struct {
	TaskID     string `json:"task_id" jsonschema:"Task ID to update"`
	NewStatus  string `json:"new_status" jsonschema:"New status column ID"`
	TargetRank string `json:"target_rank,omitempty" jsonschema:"Optional target LexoRank string"`
}

type UpdateTaskInput struct {
	TaskID       string                            `json:"task_id" jsonschema:"Task ID to update"`
	Title        string                            `json:"title,omitempty" jsonschema:"Optional new title"`
	Description  string                            `json:"description,omitempty" jsonschema:"Optional new markdown content/description"`
	Status       string                            `json:"status,omitempty" jsonschema:"Optional new status column ID"`
	Tags         []string                          `json:"tags,omitempty" jsonschema:"Optional new list of tags"`
	TargetRank   string                            `json:"target_rank,omitempty" jsonschema:"Optional new LexoRank string"`
	CustomFields map[string]model.CustomFieldValue `json:"custom_fields,omitempty" jsonschema:"Optional custom field values"`
}

type SearchTasksInput struct {
	Query string `json:"query" jsonschema:"Search query keyword"`
}

type GetTasksOutput struct {
	Tasks []*model.Task `json:"tasks" jsonschema:"List of tasks"`
}

type SearchTasksOutput struct {
	Tasks []*model.Task `json:"tasks" jsonschema:"List of tasks matching query"`
}

func NewMCPServer(store *markdown.Store, searchEngine *search.Engine) (*Server, error) {
	impl := &mcp.Implementation{
		Name:    "LocalKanban MCP Server",
		Version: "1.0.0",
	}

	mcpSrv := mcp.NewServer(impl, nil)
	s := &Server{
		mcpServer:    mcpSrv,
		store:        store,
		searchEngine: searchEngine,
	}

	s.registerTools()
	return s, nil
}

func (s *Server) registerTools() {
	// 1. get_tasks
	mcp.AddTool(s.mcpServer, &mcp.Tool{
		Name:        "get_tasks",
		Description: "Get list of tasks with optional filtering by status and tag.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input GetTasksInput) (*mcp.CallToolResult, *GetTasksOutput, error) {
		tasks, err := s.store.GetAllTasks()
		if err != nil {
			return nil, nil, fmt.Errorf("failed to fetch tasks: %w", err)
		}

		var filtered []*model.Task
		for _, t := range tasks {
			if input.Status != "" && t.ColumnID != input.Status {
				continue
			}
			if input.Tag != "" {
				hasTag := false
				for _, tag := range t.Tags {
					if strings.EqualFold(tag, input.Tag) {
						hasTag = true
						break
					}
				}
				if !hasTag {
					continue
				}
			}
			filtered = append(filtered, t)
		}

		if input.Limit > 0 && len(filtered) > input.Limit {
			filtered = filtered[:input.Limit]
		}

		return nil, &GetTasksOutput{Tasks: filtered}, nil
	})

	// 2. create_task
	mcp.AddTool(s.mcpServer, &mcp.Tool{
		Name:        "create_task",
		Description: "Create a new kanban task markdown file.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input CreateTaskInput) (*mcp.CallToolResult, *model.Task, error) {
		if strings.TrimSpace(input.Title) == "" {
			return nil, nil, fmt.Errorf("task title cannot be empty")
		}

		status := input.Status
		if status == "" {
			status = "col-todo"
		}

		allTasks, _ := s.store.GetAllTasks()
		var colTasks []*model.Task
		for _, t := range allTasks {
			if t.ColumnID == status {
				colTasks = append(colTasks, t)
			}
		}

		var newRank string
		if len(colTasks) == 0 {
			newRank = lexorank.Between("", "")
		} else {
			lastRank := colTasks[len(colTasks)-1].Rank
			newRank = lexorank.Between(lastRank, "")
		}

		newTask := &model.Task{
			Title:    strings.TrimSpace(input.Title),
			ColumnID: status,
			Rank:     newRank,
			Tags:     input.Tags,
			Content:  input.Description,
		}

		if err := s.store.SaveTask(newTask); err != nil {
			return nil, nil, fmt.Errorf("failed to save task: %w", err)
		}

		return nil, newTask, nil
	})

	// 3. update_task_status
	mcp.AddTool(s.mcpServer, &mcp.Tool{
		Name:        "update_task_status",
		Description: "Update the status column and optional rank of a kanban task.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input UpdateTaskStatusInput) (*mcp.CallToolResult, *model.Task, error) {
		if input.TaskID == "" {
			return nil, nil, fmt.Errorf("task_id is required")
		}
		if input.NewStatus == "" {
			return nil, nil, fmt.Errorf("new_status is required")
		}

		task, err := s.store.GetTaskByID(input.TaskID)
		if err != nil {
			return nil, nil, fmt.Errorf("task not found: %w", err)
		}

		task.ColumnID = input.NewStatus
		if input.TargetRank != "" {
			task.Rank = input.TargetRank
		}

		if err := s.store.SaveTask(task); err != nil {
			return nil, nil, fmt.Errorf("failed to update task: %w", err)
		}

		return nil, task, nil
	})

	// 4. search_tasks_fts
	mcp.AddTool(s.mcpServer, &mcp.Tool{
		Name:        "search_tasks_fts",
		Description: "Search tasks using SQLite FTS5 full-text search.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input SearchTasksInput) (*mcp.CallToolResult, *SearchTasksOutput, error) {
		if strings.TrimSpace(input.Query) == "" {
			return nil, nil, fmt.Errorf("query is required")
		}

		taskIDs, err := s.searchEngine.Search(input.Query)
		if err != nil {
			return nil, nil, fmt.Errorf("search failed: %w", err)
		}

		allTasks, err := s.store.GetAllTasks()
		if err != nil {
			return nil, nil, fmt.Errorf("failed to load tasks: %w", err)
		}

		taskMap := make(map[string]*model.Task)
		for _, t := range allTasks {
			taskMap[t.ID] = t
		}

		var matched []*model.Task
		for _, id := range taskIDs {
			if t, ok := taskMap[id]; ok {
				matched = append(matched, t)
			}
		}

		return nil, &SearchTasksOutput{Tasks: matched}, nil
	})

	// 5. update_task
	mcp.AddTool(s.mcpServer, &mcp.Tool{
		Name:        "update_task",
		Description: "Update task fields such as title, description, status, tags, rank, or custom fields.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, input UpdateTaskInput) (*mcp.CallToolResult, *model.Task, error) {
		if strings.TrimSpace(input.TaskID) == "" {
			return nil, nil, fmt.Errorf("task_id is required")
		}

		task, err := s.store.GetTaskByID(input.TaskID)
		if err != nil {
			return nil, nil, fmt.Errorf("task not found: %w", err)
		}

		if strings.TrimSpace(input.Title) != "" {
			task.Title = strings.TrimSpace(input.Title)
		}
		if input.Description != "" {
			task.Content = input.Description
		}
		if input.Status != "" {
			task.ColumnID = input.Status
		}
		if input.Tags != nil {
			task.Tags = input.Tags
		}
		if input.TargetRank != "" {
			task.Rank = input.TargetRank
		}
		if input.CustomFields != nil {
			task.CustomFields = input.CustomFields
		}

		if err := s.store.SaveTask(task); err != nil {
			return nil, nil, fmt.Errorf("failed to update task: %w", err)
		}

		return nil, task, nil
	})
}

func (s *Server) RunStdio(ctx context.Context) error {
	transport := &mcp.StdioTransport{}
	return s.mcpServer.Run(ctx, transport)
}

func (s *Server) NewSSEHandler() http.Handler {
	return mcp.NewSSEHandler(func(req *http.Request) *mcp.Server {
		return s.mcpServer
	}, &mcp.SSEOptions{
		DisableLocalhostProtection: true,
	})
}

func (s *Server) MCPServer() *mcp.Server {
	return s.mcpServer
}
