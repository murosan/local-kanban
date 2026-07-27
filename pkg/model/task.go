package model

import (
	"time"
)

type TaskStatus string

const (
	StatusTodo       TaskStatus = "Todo"
	StatusInProgress TaskStatus = "In Progress"
	StatusReview     TaskStatus = "Review"
	StatusDone       TaskStatus = "Done"
)

var DefaultStatuses = []TaskStatus{
	StatusTodo,
	StatusInProgress,
	StatusReview,
	StatusDone,
}

// Task represents a kanban task card and its associated markdown file structure.
type Task struct {
	ID         string     `json:"id" yaml:"id"`
	Title      string     `json:"title" yaml:"title"`
	Status     TaskStatus `json:"status" yaml:"status"`
	Rank       string     `json:"rank" yaml:"rank"`
	Tags       []string   `json:"tags,omitempty" yaml:"tags,omitempty"`
	Assignee   string     `json:"assignee,omitempty" yaml:"assignee,omitempty"`
	CreatedAt  time.Time  `json:"created_at" yaml:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at" yaml:"updated_at"`
	SlackLinks []string   `json:"slack_links,omitempty" yaml:"slack_links,omitempty"`

	// Body content of the markdown file (after frontmatter)
	Content  string `json:"content" yaml:"-"`
	FilePath string `json:"file_path,omitempty" yaml:"-"`
}

type StatusItem struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color,omitempty"`
}

type ThemeConfig struct {
	Name        string `json:"name,omitempty"`
	PrimaryBg   string `json:"primaryBg,omitempty"`
	CardBg      string `json:"cardBg,omitempty"`
	AccentColor string `json:"accentColor,omitempty"`
	TextColor   string `json:"textColor,omitempty"`
}

type BoardConfig struct {
	Columns  []Column     `json:"columns"`
	Statuses []StatusItem `json:"statuses,omitempty"`
	Theme    *ThemeConfig `json:"theme,omitempty"`
	Language string       `json:"language,omitempty"`
}

type Column struct {
	ID      string     `json:"id"`
	Title   string     `json:"title"`
	Status  TaskStatus `json:"status"`
	Visible bool       `json:"visible"`
	Color   string     `json:"color,omitempty"`
	Order   int        `json:"order,omitempty"`
}
