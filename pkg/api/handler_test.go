package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"localkanban/pkg/markdown"
	"localkanban/pkg/model"
)

func TestConfigRoutes(t *testing.T) {
	tempDir := t.TempDir()
	store, err := markdown.NewStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	server := NewServer(store)
	mux := http.NewServeMux()
	server.RegisterRoutes(mux)

	// 1. GET /api/config (Initial default)
	reqGet := httptest.NewRequest("GET", "/api/config", nil)
	wGet := httptest.NewRecorder()
	mux.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("expected status 200 GET /api/config, got %d", wGet.Code)
	}

	var cfg model.BoardConfig
	if err := json.NewDecoder(wGet.Body).Decode(&cfg); err != nil {
		t.Fatalf("failed to decode config: %v", err)
	}
	if len(cfg.Columns) != 4 {
		t.Errorf("expected 4 default columns, got %d", len(cfg.Columns))
	}

	// 2. PUT /api/config (Save theme & custom columns)
	updatedCfg := model.BoardConfig{
		Columns: cfg.Columns,
		Theme: &model.ThemeConfig{
			Name:        "midnight",
			PrimaryBg:   "#0a0e1a",
			CardBg:      "#1e293b",
			AccentColor: "#6366f1",
			TextColor:   "#f1f5f9",
		},
	}

	bodyBytes, _ := json.Marshal(updatedCfg)
	reqPut := httptest.NewRequest("PUT", "/api/config", bytes.NewReader(bodyBytes))
	wPut := httptest.NewRecorder()
	mux.ServeHTTP(wPut, reqPut)

	if wPut.Code != http.StatusOK {
		t.Fatalf("expected status 200 PUT /api/config, got %d", wPut.Code)
	}

	// 3. GET /api/config after PUT
	reqGet2 := httptest.NewRequest("GET", "/api/config", nil)
	wGet2 := httptest.NewRecorder()
	mux.ServeHTTP(wGet2, reqGet2)

	var cfg2 model.BoardConfig
	if err := json.NewDecoder(wGet2.Body).Decode(&cfg2); err != nil {
		t.Fatalf("failed to decode config: %v", err)
	}

	if cfg2.Theme == nil || cfg2.Theme.Name != "midnight" {
		t.Errorf("expected theme name 'midnight', got %+v", cfg2.Theme)
	}
	if cfg2.Theme.AccentColor != "#6366f1" {
		t.Errorf("expected accent color '#6366f1', got '%s'", cfg2.Theme.AccentColor)
	}
}
