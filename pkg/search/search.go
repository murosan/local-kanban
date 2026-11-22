package search

import (
	"strings"

	"github.com/murosan/local-kanban/pkg/cache"
)

type Engine struct {
	cache *cache.SQLiteCache
}

func NewEngine(c *cache.SQLiteCache) *Engine {
	return &Engine{
		cache: c,
	}
}

// Available reports whether the backing SQLite cache is initialized.
func (e *Engine) Available() bool {
	return e != nil && e.cache != nil
}

// Search searches task IDs matching query using SQLite FTS5 with LIKE fallback.
func (e *Engine) Search(query string) ([]string, error) {
	cleanQuery := strings.TrimSpace(query)
	if cleanQuery == "" {
		return nil, nil
	}

	if e.cache != nil {
		return e.cache.SearchFTS(cleanQuery)
	}

	return nil, nil
}
