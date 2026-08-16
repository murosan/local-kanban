package model

import (
	"strings"
	"time"
)

type CustomFieldType string

const (
	FieldTypeDropdown  CustomFieldType = "dropdown"
	FieldTypeText      CustomFieldType = "text"
	FieldTypeNumber    CustomFieldType = "number"
	FieldTypeDate      CustomFieldType = "date"
	FieldTypeCheckbox  CustomFieldType = "checkbox"
	FieldTypeLink      CustomFieldType = "link"
	FieldTypeChecklist CustomFieldType = "checklist"
)

type CustomFieldOption struct {
	ID    string `json:"id"              yaml:"id"`
	Value string `json:"value"           yaml:"value"`
	Color string `json:"color,omitempty" yaml:"color,omitempty"`
}

type CustomFieldDef struct {
	ID      string              `json:"id"                yaml:"id"`
	Name    string              `json:"name"              yaml:"name"`
	Type    CustomFieldType     `json:"type"              yaml:"type"`
	Options []CustomFieldOption `json:"options,omitempty" yaml:"options,omitempty"`
}

const CurrentTaskVersion = 2

type CustomFieldValue struct {
	ID      string              `json:"id"                 yaml:"id"`
	FieldID string              `json:"field_id,omitempty" yaml:"field_id,omitempty"`
	Name    string              `json:"name"               yaml:"name"`
	Type    CustomFieldType     `json:"type"               yaml:"type"`
	Value   any                 `json:"value"              yaml:"value"`
	Options []CustomFieldOption `json:"options,omitempty"  yaml:"options,omitempty"`
	Enabled bool                `json:"enabled"            yaml:"enabled"`
}

type SubtaskRef struct {
	ID        string `json:"id"        yaml:"id"`
	Completed bool   `json:"completed" yaml:"completed"`
}

// Task represents a kanban task card and its associated markdown file structure.
type Task struct {
	Version      int                `json:"version"                 yaml:"version"`
	ID           string             `json:"id"                      yaml:"id"`
	ParentID     string             `json:"parent_id,omitempty"     yaml:"parent_id,omitempty"`
	Title        string             `json:"title"                   yaml:"title"`
	ColumnID     string             `json:"column_id,omitempty"     yaml:"column_id,omitempty"`
	Rank         string             `json:"rank"                    yaml:"rank"`
	Tags         []string           `json:"tags,omitempty"          yaml:"tags,omitempty"`
	CreatedAt    time.Time          `json:"created_at"              yaml:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"              yaml:"updated_at"`
	CustomFields []CustomFieldValue `json:"custom_fields,omitempty" yaml:"custom_fields,omitempty"`

	// Subtasks references defined on parent task (SSOT)
	Subtasks []SubtaskRef `json:"subtasks,omitempty" yaml:"subtasks,omitempty"`

	// Subtask computed / populated fields for API responses
	SubtasksCount          int  `json:"subtasks_count,omitempty"           yaml:"-"`
	SubtasksCompletedCount int  `json:"subtasks_completed_count,omitempty" yaml:"-"`
	SubtaskDetails         any  `json:"subtask_details,omitempty"          yaml:"-"`
	Completed              bool `json:"completed,omitempty"                yaml:"-"`

	// Body content of the markdown file (after frontmatter)
	Content  string `json:"content,omitempty"   yaml:"-"`
	Summary  string `json:"summary,omitempty"   yaml:"-"`
	FilePath string `json:"file_path,omitempty" yaml:"-"`
}

func GenerateSummary(content string) string {
	lines := strings.Split(content, "\n")
	var cleaned []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			continue
		}
		for strings.HasPrefix(trimmed, "#") {
			trimmed = strings.TrimPrefix(trimmed, "#")
		}
		trimmed = strings.TrimSpace(trimmed)
		if trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	if len(cleaned) == 0 {
		return ""
	}
	result := strings.Join(cleaned, " ")
	runes := []rune(result)
	const maxLen = 200
	if len(runes) > maxLen {
		return string(runes[:maxLen]) + "..."
	}
	return result
}

type ThemeConfig struct {
	Name        string `json:"name,omitempty"`
	PrimaryBg   string `json:"primaryBg,omitempty"`
	CardBg      string `json:"cardBg,omitempty"`
	AccentColor string `json:"accentColor,omitempty"`
	TextColor   string `json:"textColor,omitempty"`
}

const CurrentBoardConfigVersion = 2

type BoardConfig struct {
	Version      int              `json:"version"`
	Columns      []Column         `json:"columns"`
	CustomFields []CustomFieldDef `json:"custom_fields,omitempty"`
	Theme        *ThemeConfig     `json:"theme,omitempty"`
	Language     string           `json:"language,omitempty"`
}

type Column struct {
	ID      string `json:"id"              yaml:"id"`
	Name    string `json:"name"            yaml:"name"`
	Visible bool   `json:"visible"         yaml:"visible"`
	Color   string `json:"color,omitempty" yaml:"color,omitempty"`
	Order   int    `json:"order,omitempty" yaml:"order,omitempty"`
}
