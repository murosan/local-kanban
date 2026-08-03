package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/murosan/local-kanban/pkg/lexorank"
	"github.com/murosan/local-kanban/pkg/markdown"
	"github.com/murosan/local-kanban/pkg/mcp"
	"github.com/murosan/local-kanban/pkg/model"
	"github.com/murosan/local-kanban/pkg/search"
)

type Server struct {
	store        *markdown.Store
	searchEngine *search.Engine
	mcpServer    *mcp.Server
}

func NewServer(
	store *markdown.Store,
	searchEngine *search.Engine,
	mcpServers ...*mcp.Server,
) *Server {
	var mcpSrv *mcp.Server
	if len(mcpServers) > 0 {
		mcpSrv = mcpServers[0]
	}
	return &Server{
		store:        store,
		searchEngine: searchEngine,
		mcpServer:    mcpSrv,
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("PUT /api/config", s.handleSaveConfig)
	mux.HandleFunc("POST /api/rebuild", s.handleRebuildCache)
	mux.HandleFunc("GET /api/tasks", s.handleGetTasks)
	mux.HandleFunc("GET /api/tasks/{id}", s.handleGetTask)
	mux.HandleFunc("POST /api/tasks", s.handleCreateTask)
	mux.HandleFunc("PUT /api/tasks/{id}", s.handleUpdateTask)
	mux.HandleFunc("DELETE /api/tasks/{id}", s.handleDeleteTask)

	if s.mcpServer != nil {
		sseHandler := s.mcpServer.NewSSEHandler()
		mux.Handle("/mcp/sse", sseHandler)
		mux.Handle("/mcp/", sseHandler)
		mux.Handle("/sse", sseHandler)
	}
}

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.GetBoardConfig()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleSaveConfig(w http.ResponseWriter, r *http.Request) {
	var cfg model.BoardConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	if err := s.store.SaveBoardConfig(&cfg); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleGetTasks(w http.ResponseWriter, r *http.Request) {
	rawQuery := r.URL.Query().Get("q")
	query := strings.ToLower(rawQuery)
	tasks, err := s.store.GetVisibleTasks()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tasks == nil {
		tasks = make([]*model.Task, 0)
	}

	if query != "" {
		if s.searchEngine != nil {
			matchedIDs, err := s.searchEngine.Search(rawQuery)
			if err == nil {
				idMap := make(map[string]bool, len(matchedIDs))
				for _, id := range matchedIDs {
					idMap[id] = true
				}
				filtered := make([]*model.Task, 0)
				for _, t := range tasks {
					if idMap[t.ID] {
						filtered = append(filtered, t)
					}
				}
				tasks = filtered
			}
		} else {
			// Fallback to in-memory search if searchEngine is nil or failed
			filtered := make([]*model.Task, 0)
			for _, t := range tasks {
				match := strings.Contains(strings.ToLower(t.Title), query) ||
					strings.Contains(strings.ToLower(t.Content), query) ||
					strings.Contains(strings.ToLower(t.Summary), query)
				if !match {
					for _, tag := range t.Tags {
						if strings.Contains(strings.ToLower(tag), query) {
							match = true
							break
						}
					}
				}
				if match {
					filtered = append(filtered, t)
				}
			}
			tasks = filtered
		}
	}

	lightweightTasks := make([]*model.Task, len(tasks))
	for i, t := range tasks {
		lightweightTasks[i] = toLightweightTask(t)
	}

	respondJSON(w, http.StatusOK, lightweightTasks)
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Task ID required")
		return
	}

	task, err := s.store.GetTaskByID(id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Task not found")
		return
	}

	if task.Summary == "" && task.Content != "" {
		task.Summary = model.GenerateSummary(task.Content)
	}

	respondJSON(w, http.StatusOK, task)
}

func toLightweightTask(t *model.Task) *model.Task {
	summary := t.Summary
	if summary == "" && t.Content != "" {
		summary = model.GenerateSummary(t.Content)
	}
	copyTask := *t
	copyTask.Content = ""
	copyTask.Summary = summary
	return &copyTask
}

type CreateTaskPayload struct {
	Title        string                            `json:"title"`
	ColumnID     string                            `json:"column_id"`
	Tags         []string                          `json:"tags"`
	CustomFields map[string]model.CustomFieldValue `json:"custom_fields,omitempty"`
	Content      string                            `json:"content"`
	PrevID       string                            `json:"prev_id"`
	NextID       string                            `json:"next_id"`
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	var payload CreateTaskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	if payload.Title == "" {
		respondError(w, http.StatusBadRequest, "Title is required")
		return
	}

	// Calculate LexoRank
	rank := s.calculateRank(payload.ColumnID, payload.PrevID, payload.NextID)

	task := &model.Task{
		Title:        payload.Title,
		ColumnID:     payload.ColumnID,
		Rank:         rank,
		Tags:         payload.Tags,
		CustomFields: payload.CustomFields,
		Content:      payload.Content,
	}

	if err := s.store.SaveTask(task); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, task)
}

type UpdateTaskPayload struct {
	Title        *string                           `json:"title"`
	ColumnID     *string                           `json:"column_id"`
	Tags         []string                          `json:"tags"`
	CustomFields map[string]model.CustomFieldValue `json:"custom_fields,omitempty"`
	Content      *string                           `json:"content"`
	Rank         *string                           `json:"rank"`
	PrevID       string                            `json:"prev_id"`
	NextID       string                            `json:"next_id"`
}

func (s *Server) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Task ID required")
		return
	}

	task, err := s.store.GetTaskByID(id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Task not found")
		return
	}

	var payload UpdateTaskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid payload")
		return
	}

	if payload.Title != nil {
		task.Title = *payload.Title
	}
	// Save old column ID before update to correctly detect column change
	oldColumnID := task.ColumnID
	if payload.ColumnID != nil {
		task.ColumnID = *payload.ColumnID
	}
	if payload.Tags != nil {
		task.Tags = payload.Tags
	}
	if payload.CustomFields != nil {
		task.CustomFields = payload.CustomFields
	}
	if payload.Content != nil {
		task.Content = *payload.Content
	}

	targetColumnID := task.ColumnID
	columnChanged := payload.ColumnID != nil && *payload.ColumnID != oldColumnID

	// Calculate new Rank if explicit rank, or prev_id / next_id provided, or column changed
	if payload.Rank != nil {
		task.Rank = *payload.Rank
	} else if payload.PrevID != "" || payload.NextID != "" || columnChanged {
		task.Rank = s.calculateRank(targetColumnID, payload.PrevID, payload.NextID)
	}

	if err := s.store.SaveTask(task); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, task)
}

func (s *Server) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "Task ID required")
		return
	}

	if err := s.store.DeleteTask(id); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRebuildCache(w http.ResponseWriter, r *http.Request) {
	if err := s.store.SyncCache(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tasks, err := s.store.GetAllTasks()
	count := 0
	if err == nil {
		count = len(tasks)
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"message": "Database rebuilt successfully",
		"count":   count,
	})
}

func (s *Server) calculateRank(columnID string, prevID, nextID string) string {
	var tasks []*model.Task
	var err error
	if columnID != "" {
		tasks, err = s.store.GetTasksByColumnID(columnID)
	} else {
		tasks, err = s.store.GetVisibleTasks()
	}
	if err != nil {
		return lexorank.Between("", "")
	}

	var prevRank, nextRank string
	for _, t := range tasks {
		if columnID != "" && t.ColumnID != columnID {
			continue
		}
		if prevID != "" && t.ID == prevID {
			prevRank = t.Rank
		}
		if nextID != "" && t.ID == nextID {
			nextRank = t.Rank
		}
	}

	return lexorank.Between(prevRank, nextRank)
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
