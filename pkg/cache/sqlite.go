package cache

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"localkanban/pkg/model"

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
		title TEXT NOT NULL,
		column_id TEXT NOT NULL,
		rank TEXT NOT NULL,
		tags TEXT,
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		file_path TEXT UNIQUE NOT NULL,
		custom_fields TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_tasks_column_rank ON tasks(column_id, rank);
	CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

	CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
		id UNINDEXED,
		title,
		content,
		tags,
		tokenize = 'trigram'
	);
	`
	_, err := c.db.Exec(schema)
	return err
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

	tagsJSON, err := json.Marshal(task.Tags)
	if err != nil {
		tagsJSON = []byte("[]")
	}

	customFieldsJSON, err := json.Marshal(task.CustomFields)
	if err != nil {
		customFieldsJSON = []byte("{}")
	}

	upsertSQL := `
	INSERT INTO tasks (id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		title=excluded.title,
		column_id=excluded.column_id,
		rank=excluded.rank,
		tags=excluded.tags,
		created_at=excluded.created_at,
		updated_at=excluded.updated_at,
		file_path=excluded.file_path,
		custom_fields=excluded.custom_fields;
	`
	_, err = tx.Exec(upsertSQL,
		task.ID,
		task.Title,
		task.ColumnID,
		task.Rank,
		string(tagsJSON),
		task.CreatedAt,
		task.UpdatedAt,
		task.FilePath,
		string(customFieldsJSON),
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

	upsertSQL := `
	INSERT INTO tasks (id, title, column_id, rank, tags, created_at, updated_at, file_path, custom_fields)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
	`
	ftsSQL := `INSERT INTO tasks_fts (id, title, content, tags) VALUES (?, ?, ?, ?);`

	for _, task := range tasks {
		tagsJSON, _ := json.Marshal(task.Tags)
		customFieldsJSON, _ := json.Marshal(task.CustomFields)

		_, err := tx.Exec(upsertSQL,
			task.ID,
			task.Title,
			task.ColumnID,
			task.Rank,
			string(tagsJSON),
			task.CreatedAt,
			task.UpdatedAt,
			task.FilePath,
			string(customFieldsJSON),
		)
		if err != nil {
			return err
		}

		tagsStr := strings.Join(task.Tags, " ")
		_, err = tx.Exec(ftsSQL, task.ID, task.Title, task.Content, tagsStr)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
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
	if err != nil || !rows.Next() {
		if rows != nil {
			_ = rows.Close()
		}
		// Fallback to raw query
		var errFallback error
		rows, errFallback = c.db.Query(
			"SELECT id FROM tasks_fts WHERE tasks_fts MATCH ?",
			cleanQuery,
		)
		if errFallback != nil {
			return nil, fmt.Errorf("fts5 search failed: %w", errFallback)
		}
	} else {
		// Reset rows reading by executing again or reading the first row
		_ = rows.Close()
		rows, err = c.db.Query("SELECT id FROM tasks_fts WHERE tasks_fts MATCH ?", escaped)
		if err != nil {
			return nil, fmt.Errorf("fts5 search failed: %w", err)
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
