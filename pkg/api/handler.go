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
	mux.HandleFunc("GET /api/tags", s.handleGetTags)

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

	taskByID := make(map[string]*model.Task, len(tasks))
	childIDs := make(map[string]bool)
	for _, t := range tasks {
		taskByID[t.ID] = t
		for _, ref := range t.Subtasks {
			childIDs[ref.ID] = true
		}
		if t.ParentID != "" {
			childIDs[t.ID] = true
		}
	}

	// Filter tasks if query exists
	var matchedRootIDs map[string]bool
	if query != "" {
		matchedRootIDs = make(map[string]bool)
		if s.searchEngine != nil {
			matchedIDs, err := s.searchEngine.Search(rawQuery)
			if err == nil {
				for _, id := range matchedIDs {
					if t, exists := taskByID[id]; exists {
						if childIDs[t.ID] {
							// Find parent of this subtask
							for _, parent := range tasks {
								for _, ref := range parent.Subtasks {
									if ref.ID == t.ID {
										matchedRootIDs[parent.ID] = true
									}
								}
								if parent.ID == t.ParentID {
									matchedRootIDs[parent.ID] = true
								}
							}
						} else {
							matchedRootIDs[t.ID] = true
						}
					}
				}
			}
		} else {
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
					if childIDs[t.ID] {
						for _, parent := range tasks {
							for _, ref := range parent.Subtasks {
								if ref.ID == t.ID {
									matchedRootIDs[parent.ID] = true
								}
							}
							if parent.ID == t.ParentID {
								matchedRootIDs[parent.ID] = true
							}
						}
					} else {
						matchedRootIDs[t.ID] = true
					}
				}
			}
		}
	}

	// Build root tasks list with attached subtasks
	rootTasks := make([]*model.Task, 0)
	for _, t := range tasks {
		if childIDs[t.ID] {
			// Subtasks are attached to root tasks
			continue
		}
		if matchedRootIDs != nil && !matchedRootIDs[t.ID] {
			continue
		}

		subs, _ := s.store.GetSubtasksByParentID(t.ID)
		t.SubtasksCount = len(subs)
		completed := 0
		lightweightSubs := make([]*model.Task, len(subs))
		for i, sub := range subs {
			if sub.Completed {
				completed++
			}
			lightweightSubs[i] = toLightweightTask(sub)
		}
		t.SubtasksCompletedCount = completed
		t.SubtaskDetails = lightweightSubs

		rootTasks = append(rootTasks, toLightweightTask(t))
	}

	respondJSON(w, http.StatusOK, rootTasks)
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

	subs, _ := s.store.GetSubtasksByParentID(task.ID)
	task.SubtasksCount = len(subs)
	completed := 0
	lightweightSubs := make([]*model.Task, len(subs))
	for i, sub := range subs {
		if sub.Completed {
			completed++
		}
		lightweightSubs[i] = toLightweightTask(sub)
	}
	task.SubtasksCompletedCount = completed
	task.SubtaskDetails = lightweightSubs

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
	ParentID     string                   `json:"parent_id,omitempty"`
	Title        string                   `json:"title"`
	ColumnID     string                   `json:"column_id"`
	Tags         []string                 `json:"tags"`
	CustomFields []model.CustomFieldValue `json:"custom_fields,omitempty"`
	Subtasks     []model.SubtaskRef       `json:"subtasks,omitempty"`
	Content      string                   `json:"content"`
	PrevID       string                   `json:"prev_id"`
	NextID       string                   `json:"next_id"`
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

	if payload.ParentID != "" {
		if err := s.store.ValidateParentID("", payload.ParentID); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	colID := payload.ColumnID
	if colID == "" {
		if payload.ParentID != "" {
			if parent, err := s.store.GetTaskByID(payload.ParentID); err == nil && parent != nil {
				colID = parent.ColumnID
			}
		}
		if colID == "" {
			colID = "col-todo"
		}
	}

	// Calculate LexoRank
	rank := s.calculateRank(colID, payload.PrevID, payload.NextID)
	if payload.ParentID != "" && payload.PrevID == "" && payload.NextID == "" {
		if subtasks, err := s.store.GetSubtasksByParentID(
			payload.ParentID,
		); err == nil &&
			len(subtasks) > 0 {
			rank = lexorank.Between(subtasks[len(subtasks)-1].Rank, "")
		}
	}

	task := &model.Task{
		ParentID:     payload.ParentID,
		Title:        payload.Title,
		ColumnID:     colID,
		Rank:         rank,
		Tags:         payload.Tags,
		CustomFields: payload.CustomFields,
		Subtasks:     payload.Subtasks,
		Content:      payload.Content,
	}

	if err := s.store.SaveTask(task); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// If parent_id is specified, add this task to parent's Subtasks
	if payload.ParentID != "" {
		if parent, err := s.store.GetTaskByID(payload.ParentID); err == nil && parent != nil {
			alreadyExists := false
			for _, ref := range parent.Subtasks {
				if ref.ID == task.ID {
					alreadyExists = true
					break
				}
			}
			if !alreadyExists {
				parent.Subtasks = append(parent.Subtasks, model.SubtaskRef{
					ID:        task.ID,
					Completed: false,
				})
				_ = s.store.SaveTask(parent)
			}
		}
	}

	respondJSON(w, http.StatusCreated, task)
}

type UpdateTaskPayload struct {
	ParentID     *string                  `json:"parent_id,omitempty"`
	Title        *string                  `json:"title"`
	ColumnID     *string                  `json:"column_id"`
	Tags         []string                 `json:"tags"`
	CustomFields []model.CustomFieldValue `json:"custom_fields,omitempty"`
	Subtasks     *[]model.SubtaskRef      `json:"subtasks,omitempty"`
	Content      *string                  `json:"content"`
	Rank         *string                  `json:"rank"`
	PrevID       string                   `json:"prev_id"`
	NextID       string                   `json:"next_id"`
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

	if payload.ParentID != nil {
		if err := s.store.ValidateParentID(task.ID, *payload.ParentID); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		task.ParentID = *payload.ParentID
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
	if payload.Subtasks != nil {
		task.Subtasks = *payload.Subtasks
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

func (s *Server) handleGetTags(w http.ResponseWriter, r *http.Request) {
	tags, err := s.store.GetAllTags()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tags == nil {
		tags = make([]string, 0)
	}
	respondJSON(w, http.StatusOK, tags)
}

func (s *Server) calculateRank(columnID string, prevID, nextID string) string {
	var prevRank, nextRank string
	if prevID != "" {
		if prevTask, err := s.store.GetTaskByID(prevID); err == nil && prevTask != nil {
			prevRank = prevTask.Rank
		}
	}
	if nextID != "" {
		if nextTask, err := s.store.GetTaskByID(nextID); err == nil && nextTask != nil {
			nextRank = nextTask.Rank
		}
	}

	if prevID == "" && nextID == "" && columnID != "" {
		tasks, err := s.store.GetTasksByColumnID(columnID)
		if err == nil && len(tasks) > 0 {
			prevRank = tasks[len(tasks)-1].Rank
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
