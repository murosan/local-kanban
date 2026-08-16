package markdown

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/murosan/local-kanban/pkg/cache"
	"github.com/murosan/local-kanban/pkg/model"

	"gopkg.in/yaml.v3"
)

type Store struct {
	dir   string
	cache *cache.SQLiteCache
	mu    sync.RWMutex
}

func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create tasks directory: %w", err)
	}
	return &Store{dir: dir}, nil
}

func (s *Store) SetCache(c *cache.SQLiteCache) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache = c
}

func (s *Store) SyncCache() error {
	s.mu.RLock()
	c := s.cache
	s.mu.RUnlock()

	if c == nil {
		return nil
	}

	tasks, err := s.GetAllTasks()
	if err != nil {
		return err
	}
	return c.SyncAll(tasks)
}

// GetBoardConfig reads .kanban_config.json or returns default columns.
// If the config file is from a previous version, it automatically migrates the config and saves it back to disk.
func (s *Store) GetBoardConfig() (*model.BoardConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.getBoardConfigUnlocked()
}

func (s *Store) getBoardConfigUnlocked() (*model.BoardConfig, error) {
	configPath := filepath.Clean(filepath.Join(s.dir, ".kanban_config.json"))
	data, err := os.ReadFile(
		configPath,
	) // #nosec G304 -- configPath is restricted to store directory
	if err != nil {
		if os.IsNotExist(err) {
			return &model.BoardConfig{
				Version: model.CurrentBoardConfigVersion,
				Columns: []model.Column{
					{ID: "col-todo", Name: "Todo", Visible: true, Color: "#3b82f6", Order: 1},
					{
						ID:      "col-in-progress",
						Name:    "In Progress",
						Visible: true,
						Color:   "#f59e0b",
						Order:   2,
					},
					{ID: "col-review", Name: "Review", Visible: true, Color: "#8b5cf6", Order: 3},
					{ID: "col-done", Name: "Done", Visible: true, Color: "#10b981", Order: 4},
				},
				Language: "ja",
			}, nil
		}
		return nil, err
	}

	type legacyColumn struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Title   string `json:"title"`
		Visible bool   `json:"visible"`
		Color   string `json:"color,omitempty"`
		Order   int    `json:"order,omitempty"`
	}

	type legacyBoardConfig struct {
		Version      int                    `json:"version"`
		Columns      []legacyColumn         `json:"columns"`
		CustomFields []model.CustomFieldDef `json:"custom_fields,omitempty"`
		Theme        *model.ThemeConfig     `json:"theme,omitempty"`
		Language     string                 `json:"language,omitempty"`
	}

	var legCfg legacyBoardConfig
	if err := json.Unmarshal(data, &legCfg); err != nil {
		return nil, fmt.Errorf("failed to parse board config: %w", err)
	}

	needsMigration := legCfg.Version < model.CurrentBoardConfigVersion

	columns := make([]model.Column, 0, len(legCfg.Columns))
	for _, col := range legCfg.Columns {
		name := col.Name
		if name == "" && col.Title != "" {
			name = col.Title
			needsMigration = true
		}
		columns = append(columns, model.Column{
			ID:      col.ID,
			Name:    name,
			Visible: col.Visible,
			Color:   col.Color,
			Order:   col.Order,
		})
	}

	cfg := &model.BoardConfig{
		Version:      model.CurrentBoardConfigVersion,
		Columns:      columns,
		CustomFields: legCfg.CustomFields,
		Theme:        legCfg.Theme,
		Language:     legCfg.Language,
	}

	if cfg.CustomFields == nil {
		cfg.CustomFields = []model.CustomFieldDef{}
	}
	if cfg.Language == "" {
		cfg.Language = "ja"
	}

	if needsMigration {
		if saveErr := s.saveBoardConfigLocked(cfg); saveErr != nil {
			_ = saveErr
		}
	}

	return cfg, nil
}

func (s *Store) saveBoardConfigLocked(cfg *model.BoardConfig) error {
	cfg.Version = model.CurrentBoardConfigVersion
	configPath := filepath.Join(s.dir, ".kanban_config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal board config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0o644); err != nil {
		return fmt.Errorf("failed to write board config: %w", err)
	}

	return nil
}

// SaveBoardConfig writes BoardConfig to .kanban_config.json.
func (s *Store) SaveBoardConfig(cfg *model.BoardConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveBoardConfigLocked(cfg)
}

func (s *Store) getVisibleColumnIDsUnlocked() ([]string, error) {
	cfg, err := s.getBoardConfigUnlocked()
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(cfg.Columns))
	for _, col := range cfg.Columns {
		if col.Visible {
			ids = append(ids, col.ID)
		}
	}
	return ids, nil
}

// GetVisibleColumnIDs returns column IDs that are defined and visible in BoardConfig.
func (s *Store) GetVisibleColumnIDs() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getVisibleColumnIDsUnlocked()
}

func (s *Store) getTasksByColumnIDsUnlocked(columnIDs []string) ([]*model.Task, error) {
	if len(columnIDs) == 0 {
		return []*model.Task{}, nil
	}

	visibleIDs, err := s.getVisibleColumnIDsUnlocked()
	if err != nil {
		return nil, err
	}
	visibleMap := make(map[string]bool, len(visibleIDs))
	for _, id := range visibleIDs {
		visibleMap[id] = true
	}

	targetIDs := make([]string, 0, len(columnIDs))
	for _, id := range columnIDs {
		if visibleMap[id] {
			targetIDs = append(targetIDs, id)
		}
	}

	if len(targetIDs) == 0 {
		return []*model.Task{}, nil
	}

	colMap := make(map[string]bool, len(targetIDs))
	for _, id := range targetIDs {
		colMap[id] = true
	}

	if s.cache != nil {
		cachedTasks, err := s.cache.GetTasksByColumnIDs(targetIDs)
		if err == nil && len(cachedTasks) > 0 {
			tasks := make([]*model.Task, 0, len(cachedTasks))
			for _, task := range cachedTasks {
				if colMap[task.ColumnID] {
					tasks = append(tasks, task)
				}
			}
			sort.Slice(tasks, func(i, j int) bool {
				return tasks[i].Rank < tasks[j].Rank
			})
			return tasks, nil
		}
	}

	// Fallback when cache is disabled or empty
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	tasks := make([]*model.Task, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		path := filepath.Join(s.dir, entry.Name())
		task, err := s.readTaskFile(path)
		if err != nil {
			continue
		}
		if colMap[task.ColumnID] {
			tasks = append(tasks, task)
		}
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].Rank < tasks[j].Rank
	})

	return tasks, nil
}

// GetTasksByColumnIDs reads and parses task markdown files matching the specified column IDs.
// It leverages SQLite cache index when available and excludes non-visible and deleted column tasks.
func (s *Store) GetTasksByColumnIDs(columnIDs []string) ([]*model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getTasksByColumnIDsUnlocked(columnIDs)
}

// GetVisibleTasks returns tasks belonging to visible and non-deleted columns.
func (s *Store) GetVisibleTasks() ([]*model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	colIDs, err := s.getVisibleColumnIDsUnlocked()
	if err != nil {
		return nil, err
	}
	return s.getTasksByColumnIDsUnlocked(colIDs)
}

// GetTasksByColumnID returns tasks belonging to a single column ID.
func (s *Store) GetTasksByColumnID(columnID string) ([]*model.Task, error) {
	return s.GetTasksByColumnIDs([]string{columnID})
}

// GetAllTasks reads all .md files in the store directory and parses them into Task structs.
func (s *Store) GetAllTasks() ([]*model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getAllTasksUnlocked()
}

func (s *Store) getAllTasksUnlocked() ([]*model.Task, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	tasks := make([]*model.Task, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		path := filepath.Join(s.dir, entry.Name())
		task, err := s.readTaskFile(path)
		if err != nil {
			// Skip corrupted or invalid non-task md files safely
			continue
		}
		tasks = append(tasks, task)
	}

	// Sort tasks by Rank ascending
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].Rank < tasks[j].Rank
	})

	return tasks, nil
}

// GetSubtasksByParentID returns all subtasks belonging to the given parent task ID.
func (s *Store) GetSubtasksByParentID(parentID string) ([]*model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	parentTask, err := s.getTaskByIDUnlocked(parentID)
	if err != nil {
		return nil, err
	}

	var subtasks []*model.Task

	// 1. If parent task has Subtasks defined (SSOT), retrieve each subtask directly
	if len(parentTask.Subtasks) > 0 {
		for _, ref := range parentTask.Subtasks {
			sub, err := s.getTaskByIDUnlocked(ref.ID)
			if err == nil && sub != nil {
				subCopy := *sub
				subCopy.Completed = ref.Completed
				subtasks = append(subtasks, &subCopy)
			}
		}
		return subtasks, nil
	}

	// 2. Legacy fallback: retrieve subtasks that have t.ParentID == parentID
	if s.cache != nil {
		cached, err := s.cache.GetSubtasksByParentID(parentID)
		if err == nil {
			return cached, nil
		}
	}

	allTasks, err := s.getAllTasksUnlocked()
	if err != nil {
		return nil, err
	}
	for _, t := range allTasks {
		if t.ParentID == parentID {
			subtasks = append(subtasks, t)
		}
	}

	return subtasks, nil
}

// ValidateParentID verifies that setting parentID on taskID is valid.
// It checks parent existence, prevents self-parenting, prevents cycles, and ensures 1-level hierarchy.
func (s *Store) ValidateParentID(taskID string, parentID string) error {
	if parentID == "" {
		return nil
	}
	if taskID != "" && parentID == taskID {
		return fmt.Errorf("task cannot be its own parent")
	}

	parentTask, err := s.GetTaskByID(parentID)
	if err != nil || parentTask == nil {
		return fmt.Errorf("parent task with ID %q not found", parentID)
	}

	if parentTask.ParentID != "" {
		return fmt.Errorf(
			"parent task is already a subtask of another task (multi-level nesting is not supported)",
		)
	}

	if taskID != "" {
		task, err := s.GetTaskByID(taskID)
		if err == nil && task != nil && len(task.Subtasks) > 0 {
			return fmt.Errorf("task already has subtasks and cannot become a subtask")
		}
		subs, err := s.GetSubtasksByParentID(taskID)
		if err == nil && len(subs) > 0 {
			return fmt.Errorf("task already has subtasks and cannot become a subtask")
		}

		// Detect cycles by traversing ancestors
		currID := parentID
		visited := make(map[string]bool)
		for currID != "" {
			if currID == taskID {
				return fmt.Errorf("circular parent-child relationship detected")
			}
			if visited[currID] {
				break
			}
			visited[currID] = true

			p, err := s.GetTaskByID(currID)
			if err != nil || p == nil {
				break
			}
			currID = p.ParentID
		}
	}

	return nil
}

// GetTaskByID finds a task by its ID.
func (s *Store) GetTaskByID(id string) (*model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getTaskByIDUnlocked(id)
}

// GetAllTags returns all unique tags sorted by last_used_at DESC (if cached) or alphabetically across all tasks.
func (s *Store) GetAllTags() ([]string, error) {
	s.mu.RLock()
	c := s.cache
	s.mu.RUnlock()

	if c != nil {
		cachedTags, err := c.GetAllTags()
		if err == nil {
			return cachedTags, nil
		}
	}

	tasks, err := s.GetAllTasks()
	if err != nil {
		return nil, err
	}
	tagSet := make(map[string]bool)
	for _, t := range tasks {
		for _, tag := range t.Tags {
			trimmed := strings.TrimSpace(tag)
			if trimmed != "" {
				tagSet[trimmed] = true
			}
		}
	}
	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	return tags, nil
}

// SaveTask writes a Task struct to its corresponding Markdown file.
func (s *Store) SaveTask(task *model.Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveTaskUnlocked(task)
}

func (s *Store) saveTaskUnlocked(task *model.Task) error {
	now := time.Now().UTC()
	if task.Version < model.CurrentTaskVersion {
		task.Version = model.CurrentTaskVersion
	}
	if task.CreatedAt.IsZero() {
		task.CreatedAt = now
	}
	task.UpdatedAt = now

	if task.ID == "" {
		task.ID = generateUUID()
	}

	for i := range task.CustomFields {
		if task.CustomFields[i].ID == "" {
			task.CustomFields[i].ID = generateUUID()
		}
	}

	filename := task.FilePath
	if filename == "" {
		// YYYYMMDD_HHMMSS_[id_short].md
		idShort := task.ID
		if len(idShort) > 8 {
			idShort = idShort[:8]
		}
		filename = filepath.Join(
			s.dir,
			fmt.Sprintf("%s_%s.md", now.Format("20060102_150405"), idShort),
		)
		task.FilePath = filename
	}

	content, err := serializeTask(task)
	if err != nil {
		return fmt.Errorf("failed to serialize task: %w", err)
	}

	if err := os.WriteFile(filename, []byte(content), 0o644); err != nil {
		return fmt.Errorf("failed to write task file: %w", err)
	}

	if s.cache != nil {
		_ = s.cache.UpsertTask(task)
	}

	return nil
}

// DeleteTask removes the task file with the given ID and any child subtasks.
func (s *Store) DeleteTask(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, err := s.getTaskByIDUnlocked(id)
	if err != nil {
		return err
	}

	// 1. If this task has subtasks, delete child subtasks directly
	for _, ref := range task.Subtasks {
		if child, err := s.getTaskByIDUnlocked(ref.ID); err == nil && child != nil {
			_ = os.Remove(child.FilePath)
			if s.cache != nil {
				_ = s.cache.DeleteTask(child.ID)
			}
		}
	}
	// Fallback for legacy child tasks if any
	if len(task.Subtasks) == 0 && s.cache != nil {
		if legacySubs, err := s.cache.GetSubtasksByParentID(id); err == nil {
			for _, sub := range legacySubs {
				_ = os.Remove(sub.FilePath)
				_ = s.cache.DeleteTask(sub.ID)
			}
		}
	}

	// 2. If this task is a subtask of another parent, remove it from that parent's Subtasks
	if task.ParentID != "" {
		if parent, err := s.getTaskByIDUnlocked(task.ParentID); err == nil && parent != nil {
			modified := false
			var newSubs []model.SubtaskRef
			for _, ref := range parent.Subtasks {
				if ref.ID == id {
					modified = true
				} else {
					newSubs = append(newSubs, ref)
				}
			}
			if modified {
				parent.Subtasks = newSubs
				_ = s.saveTaskUnlocked(parent)
			}
		}
	}

	if err := os.Remove(task.FilePath); err != nil {
		return fmt.Errorf("failed to remove task file: %w", err)
	}

	if s.cache != nil {
		_ = s.cache.DeleteTask(id)
	}

	return nil
}

func (s *Store) getTaskByIDUnlocked(id string) (*model.Task, error) {
	if s.cache != nil {
		task, err := s.cache.GetTaskByID(id)
		if err == nil && task != nil {
			return task, nil
		}
	}

	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		path := filepath.Join(s.dir, entry.Name())
		task, err := s.readTaskFile(path)
		if err == nil && task.ID == id {
			return task, nil
		}
	}
	return nil, os.ErrNotExist
}

func (s *Store) readTaskFile(path string) (*model.Task, error) {
	cleanPath := filepath.Clean(path)
	data, err := os.ReadFile(cleanPath) // #nosec G304 -- cleanPath is restricted to task file path
	if err != nil {
		return nil, err
	}

	task, err := parseTaskContent(string(data))
	if err != nil {
		return nil, err
	}
	task.FilePath = path
	return task, nil
}

type legacyTaskV1 struct {
	Version      int                               `yaml:"version"`
	ID           string                            `yaml:"id"`
	ParentID     string                            `yaml:"parent_id,omitempty"`
	Title        string                            `yaml:"title"`
	ColumnID     string                            `yaml:"column_id,omitempty"`
	Rank         string                            `yaml:"rank"`
	Tags         []string                          `yaml:"tags,omitempty"`
	CreatedAt    time.Time                         `yaml:"created_at"`
	UpdatedAt    time.Time                         `yaml:"updated_at"`
	CustomFields map[string]model.CustomFieldValue `yaml:"custom_fields,omitempty"`
}

func parseTaskContent(raw string) (*model.Task, error) {
	lines := strings.Split(raw, "\n")
	if len(lines) < 3 || strings.TrimSpace(lines[0]) != "---" {
		return nil, fmt.Errorf("invalid markdown header: missing frontmatter start '---'")
	}

	endIdx := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			endIdx = i
			break
		}
	}

	if endIdx == -1 {
		return nil, fmt.Errorf("invalid markdown header: missing frontmatter end '---'")
	}

	yamlContent := strings.Join(lines[1:endIdx], "\n")
	bodyContent := strings.Join(lines[endIdx+1:], "\n")

	var task model.Task
	err := yaml.Unmarshal([]byte(yamlContent), &task)
	if err != nil || task.Version < model.CurrentTaskVersion {
		// Attempt parsing as legacy v1 (map-based custom fields or unversioned)
		var legTask legacyTaskV1
		if legErr := yaml.Unmarshal(
			[]byte(yamlContent),
			&legTask,
		); legErr == nil &&
			legTask.ID != "" {
			task = model.Task{
				Version:   model.CurrentTaskVersion,
				ID:        legTask.ID,
				ParentID:  legTask.ParentID,
				Title:     legTask.Title,
				ColumnID:  legTask.ColumnID,
				Rank:      legTask.Rank,
				Tags:      legTask.Tags,
				CreatedAt: legTask.CreatedAt,
				UpdatedAt: legTask.UpdatedAt,
			}
			for key, cf := range legTask.CustomFields {
				id := cf.ID
				if id == "" {
					id = key
				}
				fieldID := cf.FieldID
				if fieldID == "" {
					fieldID = key
				}
				name := cf.Name
				if name == "" {
					name = key
				}
				cType := cf.Type
				if cType == "" {
					cType = model.FieldTypeText
				}
				task.CustomFields = append(task.CustomFields, model.CustomFieldValue{
					ID:      id,
					FieldID: fieldID,
					Name:    name,
					Type:    cType,
					Value:   cf.Value,
					Options: cf.Options,
					Enabled: cf.Enabled,
				})
			}
		} else if err != nil {
			return nil, fmt.Errorf("failed to unmarshal yaml frontmatter: %w", err)
		}
	}

	if task.Version < model.CurrentTaskVersion {
		task.Version = model.CurrentTaskVersion
	}

	task.Content = strings.TrimPrefix(bodyContent, "\n")
	task.Summary = model.GenerateSummary(task.Content)
	return &task, nil
}

func serializeTask(t *model.Task) (string, error) {
	if t.Version < model.CurrentTaskVersion {
		t.Version = model.CurrentTaskVersion
	}
	frontmatterBytes, err := yaml.Marshal(t)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	buf.WriteString("---\n")
	buf.Write(frontmatterBytes)
	buf.WriteString("---\n\n")
	buf.WriteString(t.Content)

	return buf.String(), nil
}

func generateUUID() string {
	return uuid.New().String()
}
