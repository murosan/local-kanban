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

// GetTaskByID finds a task by its ID.
func (s *Store) GetTaskByID(id string) (*model.Task, error) {
	tasks, err := s.GetAllTasks()
	if err != nil {
		return nil, err
	}
	for _, t := range tasks {
		if t.ID == id {
			return t, nil
		}
	}
	return nil, os.ErrNotExist
}

// SaveTask writes a Task struct to its corresponding Markdown file.
func (s *Store) SaveTask(task *model.Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if task.CreatedAt.IsZero() {
		task.CreatedAt = now
	}
	task.UpdatedAt = now

	if task.ID == "" {
		task.ID = generateUUID()
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

// DeleteTask removes the task file with the given ID.
func (s *Store) DeleteTask(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, err := s.getTaskByIDUnlocked(id)
	if err != nil {
		return err
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
	if err := yaml.Unmarshal([]byte(yamlContent), &task); err != nil {
		return nil, fmt.Errorf("failed to unmarshal yaml frontmatter: %w", err)
	}

	task.Content = strings.TrimPrefix(bodyContent, "\n")
	task.Summary = model.GenerateSummary(task.Content)
	return &task, nil
}

func serializeTask(t *model.Task) (string, error) {
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
