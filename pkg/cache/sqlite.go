package cache

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/murosan/local-kanban/pkg/model"

	_ "modernc.org/sqlite"
)

type SQLiteCache struct {
	db *sql.DB
	mu sync.RWMutex
}

func NewSQLiteCache(dbPath string) (*SQLiteCache, error) {
	if dir := filepath.Dir(dbPath); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("failed to create db directory: %w", err)
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite db: %w", err)
	}

	// Enable WAL mode
	_, _ = db.Exec("PRAGMA journal_mode=WAL;")

	cache := &SQLiteCache{db: db}
	if err := cache.initSchema(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return cache, nil
}

func (c *SQLiteCache) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

func (c *SQLiteCache) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		parent_id TEXT,
		title TEXT NOT NULL,
		column_id TEXT NOT NULL,
		rank TEXT NOT NULL,
		tags TEXT,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		file_path TEXT UNIQUE NOT NULL,
		custom_fields TEXT,
		summary TEXT,
		subtasks TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_tasks_column_rank ON tasks(column_id, rank);
	CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
	CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

	CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
		id UNINDEXED,
		title,
		content,
		tags,
		tokenize = 'trigram'
	);

	CREATE TABLE IF NOT EXISTS tags (
		name TEXT PRIMARY KEY,
		last_used_at DATETIME NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_tags_last_used_at ON tags(last_used_at DESC);
	`
	if _, err := c.db.Exec(schema); err != nil {
		return err
	}
	// Migrate existing tables if summary, parent_id, or subtasks column is missing
	_, _ = c.db.Exec("ALTER TABLE tasks ADD COLUMN summary TEXT;")
	_, _ = c.db.Exec("ALTER TABLE tasks ADD COLUMN parent_id TEXT;")
	_, _ = c.db.Exec("ALTER TABLE tasks ADD COLUMN subtasks TEXT;")
	_, _ = c.db.Exec("CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);")
	return nil
}

func (c *SQLiteCache) UpsertTask(task *model.Task) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if task.Summary == "" && task.Content != "" {
		task.Summary = model.GenerateSummary(task.Content)
	}

	tagsJSON, err := json.Marshal(task.Tags)
	if err != nil {
		tagsJSON = []byte("[]")
	}

	customFieldsJSON, err := json.Marshal(task.CustomFields)
	if err != nil {
		customFieldsJSON = []byte("[]")
	}

	subtasksJSON, err := json.Marshal(task.Subtasks)
	if err != nil {
		subtasksJSON = []byte("[]")
	}

	upsertSQL := `
	INSERT INTO tasks (id, parent_id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields, summary, subtasks)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		parent_id=excluded.parent_id,
		title=excluded.title,
		column_id=excluded.column_id,
		rank=excluded.rank,
		tags=excluded.tags,
		created_at=excluded.created_at,
		updated_at=excluded.updated_at,
		file_path=excluded.file_path,
		custom_fields=excluded.custom_fields,
		summary=excluded.summary,
		subtasks=excluded.subtasks;
	`
	_, err = tx.Exec(upsertSQL,
		task.ID,
		task.ParentID,
		task.Title,
		task.ColumnID,
		task.Rank,
		string(tagsJSON),
		task.CreatedAt,
		task.UpdatedAt,
		task.FilePath,
		string(customFieldsJSON),
		task.Summary,
		string(subtasksJSON),
	)
	if err != nil {
		return fmt.Errorf("failed to upsert task into tasks table: %w", err)
	}

	// Update FTS5 table
	tagsStr := strings.Join(task.Tags, " ")
	_, _ = tx.Exec("DELETE FROM tasks_fts WHERE id = ?", task.ID)
	_, err = tx.Exec(
		"INSERT INTO tasks_fts (id, title, content, tags) VALUES (?, ?, ?, ?)",
		task.ID,
		task.Title,
		task.Content,
		tagsStr,
	)
	if err != nil {
		return fmt.Errorf("failed to insert into tasks_fts: %w", err)
	}

	// Update tags table
	upsertTagSQL := `
	INSERT INTO tags (name, last_used_at)
	VALUES (?, ?)
	ON CONFLICT(name) DO UPDATE SET last_used_at = excluded.last_used_at;
	`
	for _, tag := range task.Tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed != "" {
			_, err = tx.Exec(upsertTagSQL, trimmed, task.UpdatedAt)
			if err != nil {
				return fmt.Errorf("failed to upsert tag into tags table: %w", err)
			}
		}
	}

	return tx.Commit()
}

func (c *SQLiteCache) DeleteTask(id string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	_, err = tx.Exec("DELETE FROM tasks WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete from tasks: %w", err)
	}

	_, err = tx.Exec("DELETE FROM tasks_fts WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete from tasks_fts: %w", err)
	}

	return tx.Commit()
}

func (c *SQLiteCache) SyncAll(tasks []*model.Task) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// Clear current cache
	if _, err := tx.Exec("DELETE FROM tasks"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM tasks_fts"); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM tags"); err != nil {
		return err
	}

	upsertSQL := `
	INSERT INTO tasks (id, parent_id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields, summary, subtasks)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
	`
	ftsSQL := `INSERT INTO tasks_fts (id, title, content, tags) VALUES (?, ?, ?, ?);`
	upsertTagSQL := `
	INSERT INTO tags (name, last_used_at)
	VALUES (?, ?)
	ON CONFLICT(name) DO UPDATE SET last_used_at = excluded.last_used_at;
	`

	tagLastUsed := make(map[string]time.Time)

	for _, task := range tasks {
		if task.Summary == "" && task.Content != "" {
			task.Summary = model.GenerateSummary(task.Content)
		}
		tagsJSON, _ := json.Marshal(task.Tags)
		customFieldsJSON, _ := json.Marshal(task.CustomFields)
		subtasksJSON, _ := json.Marshal(task.Subtasks)

		_, err := tx.Exec(upsertSQL,
			task.ID,
			task.ParentID,
			task.Title,
			task.ColumnID,
			task.Rank,
			string(tagsJSON),
			task.CreatedAt,
			task.UpdatedAt,
			task.FilePath,
			string(customFieldsJSON),
			task.Summary,
			string(subtasksJSON),
		)
		if err != nil {
			return err
		}

		tagsStr := strings.Join(task.Tags, " ")
		_, err = tx.Exec(ftsSQL, task.ID, task.Title, task.Content, tagsStr)
		if err != nil {
			return err
		}

		for _, tag := range task.Tags {
			trimmed := strings.TrimSpace(tag)
			if trimmed != "" {
				if last, exists := tagLastUsed[trimmed]; !exists || task.UpdatedAt.After(last) {
					tagLastUsed[trimmed] = task.UpdatedAt
				}
			}
		}
	}

	for tag, lastUsed := range tagLastUsed {
		_, err = tx.Exec(upsertTagSQL, tag, lastUsed)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetAllTags returns all unique tag names sorted by last_used_at DESC, name ASC.
func (c *SQLiteCache) GetAllTags() ([]string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	rows, err := c.db.Query("SELECT name FROM tags ORDER BY last_used_at DESC, name ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to query tags: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, fmt.Errorf("failed to scan tag: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error during tags iteration: %w", err)
	}
	return tags, nil
}

func (c *SQLiteCache) SearchFTS(query string) ([]string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return nil, nil
	}

	// Try double-quoted substring query for trigram index first
	escaped := fmt.Sprintf(`"%s"`, strings.ReplaceAll(cleanQuery, `"`, `""`))
	rows, err := c.db.Query("SELECT id FROM tasks_fts WHERE tasks_fts MATCH ?", escaped)
	if err != nil {
		// Fallback to raw query
		var errFallback error
		rows, errFallback = c.db.Query(
			"SELECT id FROM tasks_fts WHERE tasks_fts MATCH ?",
			cleanQuery,
		)
		if errFallback != nil {
			return nil, fmt.Errorf("fts5 search failed: %w", errFallback)
		}
	}
	defer func() { _ = rows.Close() }()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}

	// If escaped query yielded no results, retry with raw query
	if len(ids) == 0 && err == nil {
		_ = rows.Close()
		rawRows, errRaw := c.db.Query(
			"SELECT id FROM tasks_fts WHERE tasks_fts MATCH ?",
			cleanQuery,
		)
		if errRaw == nil {
			defer func() { _ = rawRows.Close() }()
			for rawRows.Next() {
				var id string
				if scanErr := rawRows.Scan(&id); scanErr == nil {
					ids = append(ids, id)
				}
			}
		}
	}

	// Fallback to LIKE query if FTS5 yields no results (e.g. for short 1-2 char Japanese queries)
	if len(ids) == 0 {
		likePattern := "%" + cleanQuery + "%"
		likeRows, err := c.db.Query(
			"SELECT id FROM tasks WHERE title LIKE ? OR tags LIKE ? ORDER BY updated_at DESC",
			likePattern,
			likePattern,
		)
		if err == nil {
			defer func() { _ = likeRows.Close() }()
			for likeRows.Next() {
				var id string
				if err := likeRows.Scan(&id); err == nil {
					ids = append(ids, id)
				}
			}
		}
	}

	return ids, nil
}

// GetFilePathsByColumnIDs returns file paths of tasks in specified column IDs, ordered by column_id and rank using idx_tasks_column_rank.
func (c *SQLiteCache) GetFilePathsByColumnIDs(columnIDs []string) ([]string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(columnIDs) == 0 {
		return nil, nil
	}

	placeholders := make([]string, len(columnIDs))
	args := make([]any, len(columnIDs))
	for i, id := range columnIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(
		"SELECT file_path FROM tasks WHERE column_id IN (%s) ORDER BY rank ASC",
		strings.Join(placeholders, ","),
	) // #nosec G201 -- placeholders construction uses sanitized '?' placeholders

	rows, err := c.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query file_paths by column_ids: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var paths []string
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, fmt.Errorf("failed to scan file_path: %w", err)
		}
		paths = append(paths, path)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error during rows iteration: %w", err)
	}
	return paths, nil
}

// GetFilePathsByColumnID returns file paths of tasks in a single column ID, ordered by rank using idx_tasks_column_rank.
func (c *SQLiteCache) GetFilePathsByColumnID(columnID string) ([]string, error) {
	return c.GetFilePathsByColumnIDs([]string{columnID})
}

// GetTasksByColumnIDs returns task summaries in specified column IDs directly from SQLite cache, ordered by rank ASC.
func (c *SQLiteCache) GetTasksByColumnIDs(columnIDs []string) ([]*model.Task, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(columnIDs) == 0 {
		return nil, nil
	}

	placeholders := make([]string, len(columnIDs))
	args := make([]any, len(columnIDs))
	for i, id := range columnIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(
		"SELECT id, parent_id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields, summary, subtasks FROM tasks WHERE column_id IN (%s) ORDER BY rank ASC",
		strings.Join(placeholders, ","),
	) // #nosec G201 -- placeholders construction uses sanitized '?' placeholders

	rows, err := c.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks by column_ids: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var tasks []*model.Task
	for rows.Next() {
		var t model.Task
		var parentID, tagsJSON, customFieldsJSON, summary, subtasksJSON sql.NullString
		err := rows.Scan(
			&t.ID,
			&parentID,
			&t.Title,
			&t.ColumnID,
			&t.Rank,
			&tagsJSON,
			&t.CreatedAt,
			&t.UpdatedAt,
			&t.FilePath,
			&customFieldsJSON,
			&summary,
			&subtasksJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}
		if parentID.Valid {
			t.ParentID = parentID.String
		}
		if tagsJSON.Valid && tagsJSON.String != "" {
			_ = json.Unmarshal([]byte(tagsJSON.String), &t.Tags)
		}
		if customFieldsJSON.Valid && customFieldsJSON.String != "" {
			_ = json.Unmarshal([]byte(customFieldsJSON.String), &t.CustomFields)
		}
		if summary.Valid {
			t.Summary = summary.String
		}
		if subtasksJSON.Valid && subtasksJSON.String != "" {
			_ = json.Unmarshal([]byte(subtasksJSON.String), &t.Subtasks)
		}
		tasks = append(tasks, &t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error during rows iteration: %w", err)
	}
	return tasks, nil
}

// GetSubtasksByParentID returns all subtasks belonging to the specified parent task ID from SQLite cache.
func (c *SQLiteCache) GetSubtasksByParentID(parentID string) ([]*model.Task, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	query := "SELECT id, parent_id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields, summary, subtasks FROM tasks WHERE parent_id = ? ORDER BY rank ASC"
	rows, err := c.db.Query(query, parentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query subtasks by parent_id: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var tasks []*model.Task
	for rows.Next() {
		var t model.Task
		var pID, tagsJSON, customFieldsJSON, summary, subtasksJSON sql.NullString
		err := rows.Scan(
			&t.ID,
			&pID,
			&t.Title,
			&t.ColumnID,
			&t.Rank,
			&tagsJSON,
			&t.CreatedAt,
			&t.UpdatedAt,
			&t.FilePath,
			&customFieldsJSON,
			&summary,
			&subtasksJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan subtask: %w", err)
		}
		if pID.Valid {
			t.ParentID = pID.String
		}
		if tagsJSON.Valid && tagsJSON.String != "" {
			_ = json.Unmarshal([]byte(tagsJSON.String), &t.Tags)
		}
		if customFieldsJSON.Valid && customFieldsJSON.String != "" {
			_ = json.Unmarshal([]byte(customFieldsJSON.String), &t.CustomFields)
		}
		if summary.Valid {
			t.Summary = summary.String
		}
		if subtasksJSON.Valid && subtasksJSON.String != "" {
			_ = json.Unmarshal([]byte(subtasksJSON.String), &t.Subtasks)
		}
		tasks = append(tasks, &t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error during subtasks iteration: %w", err)
	}
	return tasks, nil
}

// GetTaskByID returns a single task by its ID from SQLite cache.
func (c *SQLiteCache) GetTaskByID(id string) (*model.Task, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	query := "SELECT id, parent_id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields, summary, subtasks FROM tasks WHERE id = ? LIMIT 1"
	row := c.db.QueryRow(query, id)

	var t model.Task
	var parentID, tagsJSON, customFieldsJSON, summary, subtasksJSON sql.NullString
	err := row.Scan(
		&t.ID,
		&parentID,
		&t.Title,
		&t.ColumnID,
		&t.Rank,
		&tagsJSON,
		&t.CreatedAt,
		&t.UpdatedAt,
		&t.FilePath,
		&customFieldsJSON,
		&summary,
		&subtasksJSON,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, os.ErrNotExist
		}
		return nil, fmt.Errorf("failed to scan task by id: %w", err)
	}
	if parentID.Valid {
		t.ParentID = parentID.String
	}
	if tagsJSON.Valid && tagsJSON.String != "" {
		_ = json.Unmarshal([]byte(tagsJSON.String), &t.Tags)
	}
	if customFieldsJSON.Valid && customFieldsJSON.String != "" {
		_ = json.Unmarshal([]byte(customFieldsJSON.String), &t.CustomFields)
	}
	if summary.Valid {
		t.Summary = summary.String
	}
	if subtasksJSON.Valid && subtasksJSON.String != "" {
		_ = json.Unmarshal([]byte(subtasksJSON.String), &t.Subtasks)
	}
	return &t, nil
}
