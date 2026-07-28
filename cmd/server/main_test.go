package main

import (
	"os"
	"testing"
)

func TestParseConfigDefaults(t *testing.T) {
	os.Unsetenv("HOST")
	os.Unsetenv("PORT")
	os.Unsetenv("TASKS_DIR")

	cfg, err := parseConfig([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.host != "127.0.0.1" {
		t.Errorf("expected default host '127.0.0.1', got '%s'", cfg.host)
	}
	if cfg.port != "3737" {
		t.Errorf("expected default port '3737', got '%s'", cfg.port)
	}
	if cfg.tasksDir != "./tasks" {
		t.Errorf("expected default tasksDir './tasks', got '%s'", cfg.tasksDir)
	}
}

func TestParseConfigEnvVars(t *testing.T) {
	os.Setenv("HOST", "0.0.0.0")
	os.Setenv("PORT", "8080")
	os.Setenv("TASKS_DIR", "/tmp/tasks")
	defer func() {
		os.Unsetenv("HOST")
		os.Unsetenv("PORT")
		os.Unsetenv("TASKS_DIR")
	}()

	cfg, err := parseConfig([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.host != "0.0.0.0" {
		t.Errorf("expected host '0.0.0.0', got '%s'", cfg.host)
	}
	if cfg.port != "8080" {
		t.Errorf("expected port '8080', got '%s'", cfg.port)
	}
	if cfg.tasksDir != "/tmp/tasks" {
		t.Errorf("expected tasksDir '/tmp/tasks', got '%s'", cfg.tasksDir)
	}
}

func TestParseConfigFlags(t *testing.T) {
	os.Unsetenv("HOST")
	os.Unsetenv("PORT")
	os.Unsetenv("TASKS_DIR")

	cfg, err := parseConfig([]string{"-host", "localhost", "-port", "9090", "-tasks-dir", "/custom/tasks"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.host != "localhost" {
		t.Errorf("expected host 'localhost', got '%s'", cfg.host)
	}
	if cfg.port != "9090" {
		t.Errorf("expected port '9090', got '%s'", cfg.port)
	}
	if cfg.tasksDir != "/custom/tasks" {
		t.Errorf("expected tasksDir '/custom/tasks', got '%s'", cfg.tasksDir)
	}
}
