package markdown

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"localkanban/pkg/model"
	"gopkg.in/yaml.v3"
)

type Store struct {
	dir string
	mu  sync.RWMutex
}

func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create tasks directory: %w", err)
	}
	return &Store{dir: dir}, nil
}

// GetBoardConfig reads .kanban_config.json or returns default columns and statuses.
func (s *Store) GetBoardConfig() (*model.BoardConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	defaultStatuses := []model.StatusItem{
		{ID: "Todo", Name: "Todo"},
		{ID: "In Progress", Name: "In Progress"},
		{ID: "Review", Name: "Review"},
		{ID: "Done", Name: "Done"},
	}

	configPath := filepath.Join(s.dir, ".kanban_config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &model.BoardConfig{
				Columns: []model.Column{
					{ID: "col-todo", Title: "Todo", Status: model.StatusTodo, Visible: true, Order: 1},
					{ID: "col-in-progress", Title: "In Progress", Status: model.StatusInProgress, Visible: true, Order: 2},
					{ID: "col-review", Title: "Review", Status: model.StatusReview, Visible: true, Order: 3},
					{ID: "col-done", Title: "Done", Status: model.StatusDone, Visible: true, Order: 4},
				},
				Statuses: defaultStatuses,
				Language: "ja",
			}, nil
		}
		return nil, err
	}

	var cfg model.BoardConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse board config: %w", err)
	}

	if len(cfg.Statuses) == 0 {
		cfg.Statuses = defaultStatuses
	}
	if cfg.Language == "" {
		cfg.Language = "ja"
	}

	return &cfg, nil
}

// SaveBoardConfig writes BoardConfig to .kanban_config.json.
func (s *Store) SaveBoardConfig(cfg *model.BoardConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	configPath := filepath.Join(s.dir, ".kanban_config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal board config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write board config: %w", err)
	}

	return nil
}

// GetAllTasks reads all .md files in the store directory and parses them into Task structs.
func (s *Store) GetAllTasks() ([]*model.Task, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	var tasks []*model.Task
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

	// Sort tasks by Status (order in DefaultStatuses), then by Rank ascending
	statusOrder := make(map[model.TaskStatus]int)
	for i, st := range model.DefaultStatuses {
		statusOrder[st] = i
	}

	sort.Slice(tasks, func(i, j int) bool {
		si, sj := statusOrder[tasks[i].Status], statusOrder[tasks[j].Status]
		if si != sj {
			return si < sj
		}
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
		filename = filepath.Join(s.dir, fmt.Sprintf("%s_%s.md", now.Format("20060102_150405"), idShort))
		task.FilePath = filename
	}

	content, err := serializeTask(task)
	if err != nil {
		return fmt.Errorf("failed to serialize task: %w", err)
	}

	if err := os.WriteFile(filename, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write task file: %w", err)
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
	data, err := os.ReadFile(path)
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
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
