package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"slices"
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
	rawQuery := strings.TrimSpace(r.URL.Query().Get("q"))
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
	parentsByChildID := make(map[string][]string)
	for _, t := range tasks {
		taskByID[t.ID] = t
		for _, ref := range t.Subtasks {
			childIDs[ref.ID] = true
			parentsByChildID[ref.ID] = append(parentsByChildID[ref.ID], t.ID)
		}
		if t.ParentID != "" {
			childIDs[t.ID] = true
			parentsByChildID[t.ID] = append(parentsByChildID[t.ID], t.ParentID)
		}
	}

	markMatchedTask := func(matchedRootIDs map[string]bool, taskID string) {
		if childIDs[taskID] {
			for _, parentID := range parentsByChildID[taskID] {
				if _, exists := taskByID[parentID]; exists {
					matchedRootIDs[parentID] = true
				}
			}
			return
		}
		if _, exists := taskByID[taskID]; exists {
			matchedRootIDs[taskID] = true
			return
		}
		// Handle subtasks with empty/hidden column_id not present in visible tasks
		if sub, err := s.store.GetTaskByID(taskID); err == nil && sub != nil && sub.ParentID != "" {
			if _, exists := taskByID[sub.ParentID]; exists {
				matchedRootIDs[sub.ParentID] = true
			}
		}
	}

	// Filter tasks if query exists
	var matchedRootIDs map[string]bool
	if query != "" {
		matchedRootIDs = make(map[string]bool)
		usedSearchEngine := false
		if s.searchEngine != nil && s.searchEngine.Available() {
			matchedIDs, err := s.searchEngine.Search(rawQuery)
			if err == nil {
				usedSearchEngine = true
				for _, id := range matchedIDs {
					markMatchedTask(matchedRootIDs, id)
				}
			}
		}
		if !usedSearchEngine {
			for _, t := range tasks {
				if matchesTaskQuery(t, query) {
					markMatchedTask(matchedRootIDs, t.ID)
				}
			}
			// Also check subtasks of visible root tasks (subtasks may have empty column_id)
			for _, t := range tasks {
				if childIDs[t.ID] || matchedRootIDs[t.ID] {
					continue
				}
				if subs, err := s.store.GetSubtasksByParentID(t.ID); err == nil {
					for _, sub := range subs {
						if matchesTaskQuery(sub, query) {
							matchedRootIDs[t.ID] = true
							break
						}
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

		s.attachSubtaskDetails(t)
		rootTasks = append(rootTasks, toLightweightTask(t))
	}

	respondJSON(w, http.StatusOK, rootTasks)
}

func matchesTaskQuery(t *model.Task, lowerQuery string) bool {
	if strings.Contains(strings.ToLower(t.Title), lowerQuery) ||
		strings.Contains(strings.ToLower(t.Content), lowerQuery) ||
		strings.Contains(strings.ToLower(t.Summary), lowerQuery) {
		return true
	}
	for _, tag := range t.Tags {
		if strings.Contains(strings.ToLower(tag), lowerQuery) {
			return true
		}
	}
	cfText := model.ExtractCustomFieldsSearchText(t.CustomFields)
	return strings.Contains(strings.ToLower(cfText), lowerQuery)
}

func (s *Server) attachSubtaskDetails(task *model.Task) {
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

	s.attachSubtaskDetails(task)

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

	if strings.TrimSpace(payload.Title) == "" {
		respondError(w, http.StatusBadRequest, "Title is required")
		return
	}

	if payload.ParentID != "" {
		if err := s.store.ValidateParentID("", payload.ParentID); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	colID := strings.TrimSpace(payload.ColumnID)
	if payload.ParentID == "" && colID == "" {
		respondError(w, http.StatusBadRequest, "column_id is required")
		return
	}

	// Calculate LexoRank
	var rank string
	if payload.ParentID != "" && payload.PrevID == "" && payload.NextID == "" {
		if subtasks, err := s.store.GetSubtasksByParentID(
			payload.ParentID,
		); err == nil &&
			len(subtasks) > 0 {
			rank = lexorank.Between(subtasks[len(subtasks)-1].Rank, "")
		} else {
			rank = lexorank.Between("", "")
		}
	} else {
		var err error
		rank, err = s.calculateRank(colID, "", payload.PrevID, payload.NextID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	task := &model.Task{
		ParentID:     payload.ParentID,
		Title:        strings.TrimSpace(payload.Title),
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
		_ = s.store.SyncParentSubtaskLinks(task.ID, "", payload.ParentID, false)
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

	var oldParentID string
	var newParentID string
	parentChanged := false

	if payload.ParentID != nil {
		if err := s.store.ValidateParentID(task.ID, *payload.ParentID); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		oldParentID = task.ParentID
		newParentID = *payload.ParentID
		if oldParentID != newParentID {
			parentChanged = true
			task.ParentID = newParentID
		}
	}
	if payload.Title != nil {
		trimmedTitle := strings.TrimSpace(*payload.Title)
		if trimmedTitle == "" {
			respondError(w, http.StatusBadRequest, "Title cannot be empty")
			return
		}
		task.Title = trimmedTitle
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
		newRank, err := s.calculateRank(targetColumnID, task.ID, payload.PrevID, payload.NextID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		task.Rank = newRank
	}

	if err := s.store.SaveTask(task); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if parentChanged {
		_ = s.store.SyncParentSubtaskLinks(task.ID, oldParentID, newParentID, task.Completed)
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
		if errors.Is(err, os.ErrNotExist) {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRebuildCache(w http.ResponseWriter, r *http.Request) {
	if err := s.store.RebalanceAllRanks(); err != nil {
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

func (s *Server) calculateRank(
	columnID string,
	movingTaskID string,
	prevID string,
	nextID string,
) (string, error) {
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
		tasks, err := s.store.GetColumnTasks(columnID)
		if err == nil {
			for _, task := range slices.Backward(tasks) {
				if task.ID != movingTaskID {
					prevRank = task.Rank
					break
				}
			}
		}
	}

	if rank, ok := lexorank.TryBetween(prevRank, nextRank); ok {
		return rank, nil
	}

	return s.rebalanceColumnAndResolveRank(
		columnID,
		movingTaskID,
		prevID,
		nextID,
		prevRank,
		nextRank,
	)
}

func (s *Server) rebalanceColumnAndResolveRank(
	columnID string,
	movingTaskID string,
	prevID string,
	nextID string,
	prevRank string,
	nextRank string,
) (string, error) {
	if columnID == "" {
		return lexorank.Between(prevRank, nextRank), nil
	}

	tasks, err := s.store.GetColumnTasks(columnID)
	if err != nil {
		return lexorank.Between(prevRank, nextRank), nil
	}

	existing := make([]*model.Task, 0, len(tasks))
	for _, t := range tasks {
		if t.ID != movingTaskID {
			existing = append(existing, t)
		}
	}

	prevIdx := -1
	nextIdx := -1
	for i, t := range existing {
		if prevID != "" && t.ID == prevID {
			prevIdx = i
		}
		if nextID != "" && t.ID == nextID {
			nextIdx = i
		}
	}

	insertIdx := len(existing)
	switch {
	case prevIdx != -1:
		insertIdx = prevIdx + 1
	case nextIdx != -1:
		insertIdx = nextIdx
	case prevID == "" && nextID != "":
		insertIdx = 0
	}

	newRanks := lexorank.GenerateRanks(len(existing) + 1)
	updates := make(map[string]string, len(existing))
	for i, t := range existing {
		rankIdx := i
		if i >= insertIdx {
			rankIdx = i + 1
		}
		updates[t.ID] = newRanks[rankIdx]
	}

	if err := s.store.UpdateTaskRanks(updates); err != nil {
		return "", err
	}

	return newRanks[insertIdx], nil
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
