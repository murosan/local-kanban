package model

import (
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
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

type LinkItem struct {
	ID    string `json:"id"              yaml:"id"`
	URL   string `json:"url"             yaml:"url"`
	Label string `json:"label,omitempty" yaml:"label,omitempty"`
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

// CloneCustomFields returns a deep copy of fields with cleared instance IDs so a duplicated task
// gets fresh unique IDs upon save while preserving FieldID, options, enabled state, and values.
func CloneCustomFields(fields []CustomFieldValue) []CustomFieldValue {
	if len(fields) == 0 {
		return nil
	}
	cloned := make([]CustomFieldValue, len(fields))
	for i, cf := range fields {
		cloned[i] = CustomFieldValue{
			ID:      "",
			FieldID: cf.FieldID,
			Name:    cf.Name,
			Type:    cf.Type,
			Value:   cloneAnyValue(cf.Value),
			Options: slices.Clone(cf.Options),
			Enabled: cf.Enabled,
		}
	}
	return cloned
}

func cloneAnyValue(v any) any {
	switch val := v.(type) {
	case nil:
		return nil
	case []string:
		return slices.Clone(val)
	case []LinkItem:
		return slices.Clone(val)
	case []map[string]any:
		out := make([]map[string]any, len(val))
		for i, m := range val {
			if m == nil {
				continue
			}
			copied := make(map[string]any, len(m))
			for k, mv := range m {
				copied[k] = cloneAnyValue(mv)
			}
			out[i] = copied
		}
		return out
	case []any:
		out := make([]any, len(val))
		for i, elem := range val {
			out[i] = cloneAnyValue(elem)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, mv := range val {
			out[k] = cloneAnyValue(mv)
		}
		return out
	case map[any]any:
		out := make(map[any]any, len(val))
		for k, mv := range val {
			out[k] = cloneAnyValue(mv)
		}
		return out
	default:
		return val
	}
}

// ExtractCustomFieldsSearchText extracts searchable plain text from enabled custom fields.
// Disabled fields, empty values, unchecked checkboxes, and unselected options are excluded.
func ExtractCustomFieldsSearchText(fields []CustomFieldValue) string {
	var parts []string
	for _, cf := range fields {
		if !cf.Enabled {
			continue
		}
		name := strings.TrimSpace(cf.Name)

		switch cf.Type {
		case FieldTypeCheckbox:
			if isCheckedBool(cf.Value) && name != "" {
				parts = append(parts, name)
			}
		case FieldTypeChecklist:
			items := extractChecklistSearchTexts(cf.Value)
			var fieldParts []string
			if name != "" {
				fieldParts = append(fieldParts, name)
			}
			fieldParts = append(fieldParts, items...)
			if len(fieldParts) > 0 {
				parts = append(parts, strings.Join(fieldParts, " "))
			}
		case FieldTypeLink:
			items := extractLinkSearchTexts(cf.Value)
			if len(items) == 0 {
				continue
			}
			if name != "" {
				parts = append(parts, name+" "+strings.Join(items, " "))
			} else {
				parts = append(parts, strings.Join(items, " "))
			}
		default:
			if valBool, ok := cf.Value.(bool); ok {
				if valBool && name != "" {
					parts = append(parts, name)
				}
				continue
			}
			valText := extractCustomFieldValueText(cf.Value)
			if valText == "" {
				continue
			}
			if name != "" {
				parts = append(parts, name+" "+valText)
			} else {
				parts = append(parts, valText)
			}
		}
	}
	return strings.Join(parts, "\n")
}

func isCheckedBool(v any) bool {
	switch val := v.(type) {
	case bool:
		return val
	case string:
		return strings.EqualFold(strings.TrimSpace(val), "true")
	default:
		return false
	}
}

func extractChecklistSearchTexts(v any) []string {
	var items []string
	switch list := v.(type) {
	case []string:
		for _, s := range list {
			if trimmed := strings.TrimSpace(s); trimmed != "" {
				items = append(items, trimmed)
			}
		}
	case []map[string]any:
		for _, m := range list {
			if text, ok := m["text"].(string); ok {
				if trimmed := strings.TrimSpace(text); trimmed != "" {
					items = append(items, trimmed)
				}
			}
		}
	case []any:
		for _, elem := range list {
			switch item := elem.(type) {
			case string:
				if trimmed := strings.TrimSpace(item); trimmed != "" {
					items = append(items, trimmed)
				}
			case map[string]any:
				if text, ok := item["text"].(string); ok {
					if trimmed := strings.TrimSpace(text); trimmed != "" {
						items = append(items, trimmed)
					}
				}
			case map[any]any:
				if text, ok := item["text"].(string); ok {
					if trimmed := strings.TrimSpace(text); trimmed != "" {
						items = append(items, trimmed)
					}
				}
			}
		}
	}
	return items
}

func extractLinkSearchTexts(v any) []string {
	var items []string
	appendNonEmpty := func(s string) {
		if trimmed := strings.TrimSpace(s); trimmed != "" {
			items = append(items, trimmed)
		}
	}
	appendFromStringMap := func(m map[string]any) {
		if label, ok := m["label"].(string); ok {
			appendNonEmpty(label)
		}
		if url, ok := m["url"].(string); ok {
			appendNonEmpty(url)
		}
	}
	appendFromAnyMap := func(m map[any]any) {
		if label, ok := m["label"].(string); ok {
			appendNonEmpty(label)
		}
		if url, ok := m["url"].(string); ok {
			appendNonEmpty(url)
		}
	}

	switch val := v.(type) {
	case string:
		appendNonEmpty(val)
	case []string:
		for _, s := range val {
			appendNonEmpty(s)
		}
	case []LinkItem:
		for _, item := range val {
			appendNonEmpty(item.Label)
			appendNonEmpty(item.URL)
		}
	case []map[string]any:
		for _, m := range val {
			appendFromStringMap(m)
		}
	case []any:
		for _, elem := range val {
			switch item := elem.(type) {
			case string:
				appendNonEmpty(item)
			case LinkItem:
				appendNonEmpty(item.Label)
				appendNonEmpty(item.URL)
			case map[string]any:
				appendFromStringMap(item)
			case map[any]any:
				appendFromAnyMap(item)
			}
		}
	}
	return items
}

func extractCustomFieldValueText(v any) string {
	switch val := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(val)
	case json.Number:
		return strings.TrimSpace(val.String())
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(val), 'f', -1, 32)
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return fmt.Sprint(val)
	case []string, []map[string]any, []any:
		return strings.Join(extractChecklistSearchTexts(val), " ")
	default:
		return strings.TrimSpace(fmt.Sprint(val))
	}
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

type BoardLane struct {
	ID        string   `json:"id"         yaml:"id"`
	ColumnIDs []string `json:"column_ids" yaml:"column_ids"`
}

type BoardConfig struct {
	Version      int              `json:"version"`
	Columns      []Column         `json:"columns"`
	Lanes        []BoardLane      `json:"lanes,omitempty"`
	CustomFields []CustomFieldDef `json:"custom_fields,omitempty"`
	Theme        *ThemeConfig     `json:"theme,omitempty"`
	Language     string           `json:"language,omitempty"`
}

type ColumnSettings struct {
	ShowCards       *bool `json:"show_cards,omitempty"        yaml:"show_cards,omitempty"`
	ShowCardDetails *bool `json:"show_card_details,omitempty" yaml:"show_card_details,omitempty"`
}

func (s *ColumnSettings) IsShowCards() bool {
	if s == nil || s.ShowCards == nil {
		return true
	}
	return *s.ShowCards
}

func (s *ColumnSettings) IsShowCardDetails() bool {
	if s == nil || s.ShowCardDetails == nil {
		return true
	}
	return *s.ShowCardDetails
}

type Column struct {
	ID         string          `json:"id"                    yaml:"id"`
	Name       string          `json:"name"                  yaml:"name"`
	Visible    bool            `json:"visible"               yaml:"visible"`
	Archived   bool            `json:"archived,omitempty"    yaml:"archived,omitempty"`
	ArchivedAt *time.Time      `json:"archived_at,omitempty" yaml:"archived_at,omitempty"`
	Color      string          `json:"color,omitempty"       yaml:"color,omitempty"`
	Order      int             `json:"order,omitempty"       yaml:"order,omitempty"`
	Settings   *ColumnSettings `json:"settings,omitempty"    yaml:"settings,omitempty"`
}

// IsActive reports whether the column is not archived.
func (c Column) IsActive() bool {
	return !c.Archived
}

// IsBoardVisible reports whether the column is active and visible on the board.
func (c Column) IsBoardVisible() bool {
	return c.Visible && !c.Archived
}

// NormalizeBoardLanes sanitizes board lanes against the active (non-archived) columns:
// - Removes archived, non-existent, and duplicate column IDs.
// - Drops lanes that end up empty.
// - Appends any active columns not present in lanes (ordered by Column.Order) as standalone lanes.
func NormalizeBoardLanes(columns []Column, lanes []BoardLane) []BoardLane {
	activeColumns := make([]Column, 0, len(columns))
	activeSet := make(map[string]bool, len(columns))
	for _, col := range columns {
		if col.ID == "" || col.Archived {
			continue
		}
		activeColumns = append(activeColumns, col)
		activeSet[col.ID] = true
	}

	slices.SortStableFunc(activeColumns, func(a, b Column) int {
		if a.Order < b.Order {
			return -1
		}
		if a.Order > b.Order {
			return 1
		}
		return 0
	})

	usedColIDs := make(map[string]bool, len(activeColumns))
	usedLaneIDs := make(map[string]bool, len(lanes)+len(activeColumns))
	uniqueLaneID := func(candidate string, fallbackColID string) string {
		id := strings.TrimSpace(candidate)
		if id == "" {
			id = "lane-" + fallbackColID
		}
		if !usedLaneIDs[id] {
			usedLaneIDs[id] = true
			return id
		}
		for suffix := 2; ; suffix++ {
			next := fmt.Sprintf("%s-%d", id, suffix)
			if !usedLaneIDs[next] {
				usedLaneIDs[next] = true
				return next
			}
		}
	}

	normalized := make([]BoardLane, 0, len(lanes)+len(activeColumns))
	for _, lane := range lanes {
		colIDs := make([]string, 0, len(lane.ColumnIDs))
		for _, colID := range lane.ColumnIDs {
			if activeSet[colID] && !usedColIDs[colID] {
				usedColIDs[colID] = true
				colIDs = append(colIDs, colID)
			}
		}
		if len(colIDs) == 0 {
			continue
		}
		normalized = append(normalized, BoardLane{
			ID:        uniqueLaneID(lane.ID, colIDs[0]),
			ColumnIDs: colIDs,
		})
	}

	for _, col := range activeColumns {
		if usedColIDs[col.ID] {
			continue
		}
		usedColIDs[col.ID] = true
		normalized = append(normalized, BoardLane{
			ID:        uniqueLaneID("lane-"+col.ID, col.ID),
			ColumnIDs: []string{col.ID},
		})
	}

	return normalized
}
