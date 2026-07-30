package model

import (
	"time"
)

type CustomFieldType string

const (
	FieldTypeDropdown CustomFieldType = "dropdown"
	FieldTypeText     CustomFieldType = "text"
	FieldTypeNumber   CustomFieldType = "number"
	FieldTypeDate     CustomFieldType = "date"
	FieldTypeCheckbox CustomFieldType = "checkbox"
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

type CustomFieldValue struct {
	FieldID string `json:"field_id" yaml:"field_id"`
	Value   any    `json:"value"    yaml:"value"`
	Enabled bool   `json:"enabled"  yaml:"enabled"`
}

// Task represents a kanban task card and its associated markdown file structure.
type Task struct {
	ID           string                      `json:"id"                      yaml:"id"`
	Title        string                      `json:"title"                   yaml:"title"`
	ColumnID     string                      `json:"column_id,omitempty"     yaml:"column_id,omitempty"`
	Rank         string                      `json:"rank"                    yaml:"rank"`
	Tags         []string                    `json:"tags,omitempty"          yaml:"tags,omitempty"`
	CreatedAt    time.Time                   `json:"created_at"              yaml:"created_at"`
	UpdatedAt    time.Time                   `json:"updated_at"              yaml:"updated_at"`
	CustomFields map[string]CustomFieldValue `json:"custom_fields,omitempty" yaml:"custom_fields,omitempty"`

	// Body content of the markdown file (after frontmatter)
	Content  string `json:"content"             yaml:"-"`
	FilePath string `json:"file_path,omitempty" yaml:"-"`
}

type ThemeConfig struct {
	Name        string `json:"name,omitempty"`
	PrimaryBg   string `json:"primaryBg,omitempty"`
	CardBg      string `json:"cardBg,omitempty"`
	AccentColor string `json:"accentColor,omitempty"`
	TextColor   string `json:"textColor,omitempty"`
}

type BoardConfig struct {
	Columns      []Column         `json:"columns"`
	CustomFields []CustomFieldDef `json:"custom_fields,omitempty"`
	Theme        *ThemeConfig     `json:"theme,omitempty"`
	Language     string           `json:"language,omitempty"`
}

type Column struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Visible bool   `json:"visible"`
	Color   string `json:"color,omitempty"`
	Order   int    `json:"order,omitempty"`
}
