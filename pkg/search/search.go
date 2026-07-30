package search

import (
	"strings"

	"localkanban/pkg/cache"
)

type Engine struct {
	cache *cache.SQLiteCache
}

func NewEngine(c *cache.SQLiteCache) *Engine {
	return &Engine{
		cache: c,
	}
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
