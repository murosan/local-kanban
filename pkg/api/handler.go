package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"localkanban/pkg/lexorank"
	"localkanban/pkg/markdown"
	"localkanban/pkg/model"
)

type Server struct {
	store *markdown.Store
}

func NewServer(store *markdown.Store) *Server {
	return &Server{store: store}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("PUT /api/config", s.handleSaveConfig)
	mux.HandleFunc("GET /api/tasks", s.handleGetTasks)
	mux.HandleFunc("POST /api/tasks", s.handleCreateTask)
	mux.HandleFunc("PUT /api/tasks/{id}", s.handleUpdateTask)
	mux.HandleFunc("DELETE /api/tasks/{id}", s.handleDeleteTask)
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
	query := strings.ToLower(r.URL.Query().Get("q"))
	tasks, err := s.store.GetAllTasks()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if query != "" {
		filtered := make([]*model.Task, 0)
		for _, t := range tasks {
			match := strings.Contains(strings.ToLower(t.Title), query) ||
				strings.Contains(strings.ToLower(t.Content), query)
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

	respondJSON(w, http.StatusOK, tasks)
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
	columnChanged := payload.ColumnID != nil && *payload.ColumnID != task.ColumnID

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

func (s *Server) calculateRank(columnID string, prevID, nextID string) string {
	tasks, err := s.store.GetAllTasks()
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

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
