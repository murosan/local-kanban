package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/murosan/local-kanban/pkg/api"
	"github.com/murosan/local-kanban/pkg/cache"
	"github.com/murosan/local-kanban/pkg/lexorank"
	"github.com/murosan/local-kanban/pkg/markdown"
	"github.com/murosan/local-kanban/pkg/mcp"
	"github.com/murosan/local-kanban/pkg/model"
	"github.com/murosan/local-kanban/pkg/search"
	"github.com/murosan/local-kanban/pkg/ui"

	"github.com/go-chi/cors"
)

const version = "1.0.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(0)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "start", "server":
		runStart(args)
	case "add":
		runAdd(args)
	case "mcp":
		runMCP(args)
	case "version", "-v", "--version":
		fmt.Printf("LocalKanban version %s\n", version)
	case "help", "-h", "--help":
		printUsage()
	default:
		if strings.HasPrefix(cmd, "-") {
			runStart(os.Args[1:])
		} else {
			fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", cmd)
			printUsage()
			os.Exit(1)
		}
	}
}

func printUsage() {
	fmt.Printf(`LocalKanban - Local-First AI-Native Kanban Tool (v%s)

Usage:
  localkanban <command> [options]

Commands:
  start           Start the LocalKanban Web UI and REST API server
  add <title>     Add a new task directly from the CLI
  mcp             Run MCP (Model Context Protocol) server in STDIO mode
  version         Show version information
  help            Show this help message

Options for 'start':
  --host <addr>      Host address to listen on (default: 127.0.0.1 or $HOST)
  --port <port>      Port number to listen on (default: 3737 or $PORT)
  --tasks-dir <dir>  Path to tasks directory (default: ./tasks or $TASKS_DIR)

Options for 'add':
  --status <col>     Target status column ID (default: col-todo)
  --tags <tag,tag>   Comma-separated list of tags
  --desc <content>   Markdown content / description for the task
  --tasks-dir <dir>  Path to tasks directory (default: ./tasks or $TASKS_DIR)

Options for 'mcp':
  --tasks-dir <dir>  Path to tasks directory (default: ./tasks or $TASKS_DIR)
`, version)
}

func runStart(args []string) {
	fs := flag.NewFlagSet("start", flag.ExitOnError)

	defaultHost := os.Getenv("HOST")
	if defaultHost == "" {
		defaultHost = "127.0.0.1"
	}
	defaultPort := os.Getenv("PORT")
	if defaultPort == "" {
		defaultPort = "3737"
	}
	defaultTasksDir := os.Getenv("TASKS_DIR")
	if defaultTasksDir == "" {
		defaultTasksDir = "./tasks"
	}

	host := fs.String("host", defaultHost, "Host address to listen on")
	port := fs.String("port", defaultPort, "Port number to listen on")
	tasksDir := fs.String("tasks-dir", defaultTasksDir, "Directory to store task markdown files")

	_ = fs.Parse(args)

	store, err := markdown.NewStore(*tasksDir)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	dbPath := filepath.Join(*tasksDir, ".local_cache.db")
	sqliteCache, err := cache.NewSQLiteCache(dbPath)
	if err != nil {
		log.Printf("Warning: Failed to initialize SQLite Cache: %v", err)
	} else {
		defer func() { _ = sqliteCache.Close() }()
		store.SetCache(sqliteCache)
	}

	tasks, err := store.GetAllTasks()
	if err == nil && len(tasks) == 0 {
		createSampleTasks(store)
	}

	if sqliteCache != nil {
		_ = store.SyncCache()
	}

	searchEngine := search.NewEngine(sqliteCache)
	mcpServer, err := mcp.NewMCPServer(store, searchEngine)
	if err != nil {
		log.Printf("Warning: Failed to initialize MCP server: %v", err)
	}

	server := api.NewServer(store, searchEngine, mcpServer)

	mux := http.NewServeMux()
	server.RegisterRoutes(mux)
	mux.Handle("/", ui.Handler())

	corsMiddleware := cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"*"},
		AllowCredentials: false,
		MaxAge:           300,
	})

	addr := fmt.Sprintf("%s:%s", *host, *port)
	cleanDir := filepath.Clean(*tasksDir)
	cleanAddr := strings.ReplaceAll(strings.ReplaceAll(addr, "\n", ""), "\r", "")
	log.Printf(
		"LocalKanban Server running on http://%s (TASKS_DIR=%s)",
		cleanAddr,
		cleanDir,
	) // #nosec G706 -- CLI startup configuration log

	srv := &http.Server{
		Addr:              addr,
		Handler:           corsMiddleware(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}

func runAdd(args []string) {
	if len(args) == 0 {
		fmt.Fprintf(
			os.Stderr,
			"Error: Task title required.\nExample: localkanban add \"Fix bug\" --tags \"backend,bug\"\n",
		)
		os.Exit(1)
	}

	fs := flag.NewFlagSet("add", flag.ExitOnError)
	defaultTasksDir := os.Getenv("TASKS_DIR")
	if defaultTasksDir == "" {
		defaultTasksDir = "./tasks"
	}

	status := fs.String("status", "col-todo", "Status column ID")
	tagsStr := fs.String("tags", "", "Comma separated tags")
	desc := fs.String("desc", "", "Task description")
	tasksDir := fs.String("tasks-dir", defaultTasksDir, "Directory to store task markdown files")

	var titleParts []string
	var flagArgs []string

	for i := 0; i < len(args); i++ {
		if strings.HasPrefix(args[i], "-") {
			flagArgs = args[i:]
			break
		} else {
			titleParts = append(titleParts, args[i])
		}
	}

	_ = fs.Parse(flagArgs)

	title := strings.Join(titleParts, " ")
	if strings.TrimSpace(title) == "" {
		fmt.Fprintf(os.Stderr, "Error: Task title cannot be empty.\n")
		os.Exit(1)
	}

	store, err := markdown.NewStore(*tasksDir)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	dbPath := filepath.Join(*tasksDir, ".local_cache.db")
	sqliteCache, err := cache.NewSQLiteCache(dbPath)
	if err == nil {
		defer func() { _ = sqliteCache.Close() }()
		store.SetCache(sqliteCache)
	}

	allTasks, _ := store.GetAllTasks()
	var colTasks []*model.Task
	for _, t := range allTasks {
		if t.ColumnID == *status {
			colTasks = append(colTasks, t)
		}
	}

	var rank string
	if len(colTasks) == 0 {
		rank = lexorank.Between("", "")
	} else {
		lastRank := colTasks[len(colTasks)-1].Rank
		rank = lexorank.Between(lastRank, "")
	}

	var tags []string
	if *tagsStr != "" {
		for _, tag := range strings.Split(*tagsStr, ",") {
			trimmed := strings.TrimSpace(tag)
			if trimmed != "" {
				tags = append(tags, trimmed)
			}
		}
	}

	task := &model.Task{
		Title:    title,
		ColumnID: *status,
		Rank:     rank,
		Tags:     tags,
		Content:  *desc,
	}

	if err := store.SaveTask(task); err != nil {
		log.Fatalf("Failed to save task: %v", err)
	}

	fmt.Printf("Task created successfully!\n")
	fmt.Printf("ID:       %s\n", task.ID)
	fmt.Printf("Title:    %s\n", task.Title)
	fmt.Printf("Status:   %s\n", task.ColumnID)
	fmt.Printf("File:     %s\n", task.FilePath)
}

func runMCP(args []string) {
	fs := flag.NewFlagSet("mcp", flag.ExitOnError)
	defaultTasksDir := os.Getenv("TASKS_DIR")
	if defaultTasksDir == "" {
		defaultTasksDir = "./tasks"
	}

	tasksDir := fs.String("tasks-dir", defaultTasksDir, "Directory to store task markdown files")
	_ = fs.Parse(args)

	store, err := markdown.NewStore(*tasksDir)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	dbPath := filepath.Join(*tasksDir, ".local_cache.db")
	sqliteCache, err := cache.NewSQLiteCache(dbPath)
	if err == nil {
		defer func() { _ = sqliteCache.Close() }()
		store.SetCache(sqliteCache)
	}

	searchEngine := search.NewEngine(sqliteCache)
	mcpServer, err := mcp.NewMCPServer(store, searchEngine)
	if err != nil {
		log.Fatalf("Failed to initialize MCP server: %v", err)
	}

	ctx := context.Background()
	if err := mcpServer.RunStdio(ctx); err != nil {
		log.Fatalf("MCP stdio server error: %v", err)
	}
}

func createSampleTasks(store *markdown.Store) {
	samples := []*model.Task{
		{
			Title:    "LocalKanban Phase 1プロトタイプ動作確認",
			ColumnID: "col-todo",
			Rank:     "0|m",
			Tags:     []string{"frontend", "backend"},
			Content:  "## 実装確認リスト\n- [x] Go Webサーバー\n- [ ] React UI dnd-kit\n- [ ] Focus / Reload 同期",
		},
		{
			Title:    "dnd-kit によるカンバンカード並び替え実装",
			ColumnID: "col-in-progress",
			Rank:     "0|n",
			Tags:     []string{"dnd-kit", "react"},
			Content:  "LexoRankアルゴリズムと連携した並び替えドラッグ＆ドロップ",
		},
		{
			Title:    "Docker Compose 構成の定義",
			ColumnID: "col-done",
			Rank:     "0|o",
			Tags:     []string{"docker", "infra"},
			Content:  "Go 1.26 と Node.js 24 による開発環境のコンテナ化",
		},
	}

	for _, sample := range samples {
		_ = store.SaveTask(sample)
	}
}
