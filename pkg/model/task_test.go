package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestExtractCustomFieldsSearchText(t *testing.T) {
	fields := []CustomFieldValue{
		{
			ID:      "cf-priority",
			FieldID: "preset-priority",
			Name:    "優先度",
			Type:    FieldTypeDropdown,
			Value:   "高",
			Options: []CustomFieldOption{
				{ID: "opt-1", Value: "高", Color: "#ef4444"},
				{ID: "opt-2", Value: "低", Color: "#6366f1"},
			},
			Enabled: true,
		},
		{
			ID:      "cf-note",
			Name:    "メモ",
			Type:    FieldTypeText,
			Value:   "要レビュー",
			Enabled: true,
		},
		{
			ID:      "cf-empty",
			Name:    "空フィールド",
			Type:    FieldTypeText,
			Value:   "   ",
			Enabled: true,
		},
		{
			ID:      "cf-disabled",
			Name:    "非表示フィールド",
			Type:    FieldTypeText,
			Value:   "シークレット",
			Enabled: false,
		},
		{
			ID:      "cf-num-float",
			Name:    "工数",
			Type:    FieldTypeNumber,
			Value:   float64(8),
			Enabled: true,
		},
		{
			ID:      "cf-num-json",
			Name:    "見積",
			Type:    FieldTypeNumber,
			Value:   json.Number("2.5"),
			Enabled: true,
		},
		{
			ID:      "cf-date",
			Name:    "期限",
			Type:    FieldTypeDate,
			Value:   "2026-08-28",
			Enabled: true,
		},
		{
			ID:      "cf-link",
			Name:    "リンク",
			Type:    FieldTypeLink,
			Value:   "https://example.com/spec",
			Enabled: true,
		},
		{
			ID:   "cf-link-list",
			Name: "関連リンク",
			Type: FieldTypeLink,
			Value: []any{
				map[string]any{
					"id":    "link-item-1",
					"label": "設計ドキュメント",
					"url":   "https://example.com/architecture",
				},
				map[string]any{
					"id":  "link-item-2",
					"url": "vscode://file/workspace/README.md",
				},
			},
			Enabled: true,
		},
		{
			ID:      "cf-link-empty",
			Name:    "空リンク",
			Type:    FieldTypeLink,
			Value:   []any{},
			Enabled: true,
		},
		{
			ID:      "cf-chk-true",
			Name:    "緊急",
			Type:    FieldTypeCheckbox,
			Value:   true,
			Enabled: true,
		},
		{
			ID:      "cf-chk-false",
			Name:    "確認済み",
			Type:    FieldTypeCheckbox,
			Value:   false,
			Enabled: true,
		},
		{
			ID:   "cf-checklist",
			Name: "買い物リスト",
			Type: FieldTypeChecklist,
			Value: []any{
				map[string]any{"id": "item-1", "text": "牛乳", "completed": false},
				map[string]any{"id": "item-2", "text": "電動ドライバー", "completed": true},
			},
			Options: []CustomFieldOption{
				{ID: "opt-del", Value: "削除済み候補"},
			},
			Enabled: true,
		},
	}

	got := ExtractCustomFieldsSearchText(fields)

	mustContain := []string{
		"優先度 高",
		"メモ 要レビュー",
		"工数 8",
		"見積 2.5",
		"期限 2026-08-28",
		"リンク https://example.com/spec",
		"関連リンク 設計ドキュメント https://example.com/architecture vscode://file/workspace/README.md",
		"緊急",
		"買い物リスト 牛乳 電動ドライバー",
	}
	for _, want := range mustContain {
		if !strings.Contains(got, want) {
			t.Errorf("expected extracted text to contain %q, got:\n%s", want, got)
		}
	}

	mustNotContain := []string{
		"低",
		"#ef4444",
		"空フィールド",
		"空リンク",
		"非表示フィールド",
		"シークレット",
		"確認済み",
		"true",
		"false",
		"item-1",
		"link-item-1",
		"link-item-2",
		"削除済み候補",
		"preset-priority",
	}
	for _, unwanted := range mustNotContain {
		if strings.Contains(got, unwanted) {
			t.Errorf("expected extracted text NOT to contain %q, got:\n%s", unwanted, got)
		}
	}
}

func TestCloneCustomFields(t *testing.T) {
	if got := CloneCustomFields(nil); got != nil {
		t.Fatalf("expected nil for empty input, got %#v", got)
	}

	orig := []CustomFieldValue{
		{
			ID:      "cf-1",
			FieldID: "preset-priority",
			Name:    "Priority",
			Type:    FieldTypeDropdown,
			Value:   "High",
			Options: []CustomFieldOption{
				{ID: "opt-1", Value: "High", Color: "#ef4444"},
			},
			Enabled: true,
		},
		{
			ID:   "cf-2",
			Name: "Checklist",
			Type: FieldTypeChecklist,
			Value: []any{
				map[string]any{"id": "item-1", "text": "Step 1", "completed": true},
			},
			Enabled: true,
		},
	}

	cloned := CloneCustomFields(orig)
	if len(cloned) != len(orig) {
		t.Fatalf("expected %d cloned fields, got %d", len(orig), len(cloned))
	}

	for i := range cloned {
		if cloned[i].ID != "" {
			t.Errorf("expected cloned[%d].ID to be cleared, got %q", i, cloned[i].ID)
		}
		if cloned[i].FieldID != orig[i].FieldID {
			t.Errorf("expected FieldID %q, got %q", orig[i].FieldID, cloned[i].FieldID)
		}
		if cloned[i].Name != orig[i].Name ||
			cloned[i].Type != orig[i].Type ||
			cloned[i].Enabled != orig[i].Enabled {
			t.Errorf("field metadata mismatch at index %d: %+v vs %+v", i, cloned[i], orig[i])
		}
	}

	// Mutating cloned options and nested checklist map must not affect orig
	cloned[0].Options[0].Value = "Low"
	if orig[0].Options[0].Value != "High" {
		t.Errorf("mutating cloned Options leaked into original: got %q", orig[0].Options[0].Value)
	}

	clonedList := cloned[1].Value.([]any)
	clonedItem := clonedList[0].(map[string]any)
	clonedItem["text"] = "Mutated"
	clonedItem["completed"] = false

	origList := orig[1].Value.([]any)
	origItem := origList[0].(map[string]any)
	if origItem["text"] != "Step 1" || origItem["completed"] != true {
		t.Errorf("mutating cloned checklist leaked into original: %#v", origItem)
	}
}

func TestColumnStatusHelpersAndNormalizeBoardLanes(t *testing.T) {
	cols := []Column{
		{ID: "col-a", Name: "A", Visible: true, Order: 1},
		{ID: "col-b", Name: "B", Visible: false, Order: 2},
		{ID: "col-c", Name: "C", Visible: true, Archived: true, Order: 3},
		{ID: "col-d", Name: "D", Visible: true, Order: 4},
	}

	if !cols[0].IsActive() || !cols[0].IsBoardVisible() {
		t.Errorf("expected col-a to be active and board-visible")
	}
	if !cols[1].IsActive() || cols[1].IsBoardVisible() {
		t.Errorf("expected col-b to be active and not board-visible")
	}
	if cols[2].IsActive() || cols[2].IsBoardVisible() {
		t.Errorf("expected col-c to be archived (neither active nor board-visible)")
	}

	lanes := []BoardLane{
		{ID: "lane-stack", ColumnIDs: []string{"col-a", "col-c", "col-deleted", "col-a", "col-b"}},
		{ID: "lane-empty", ColumnIDs: []string{"col-c"}},
	}

	normalized := NormalizeBoardLanes(cols, lanes)
	if len(normalized) != 2 {
		t.Fatalf("expected 2 normalized lanes, got %d: %+v", len(normalized), normalized)
	}
	if normalized[0].ID != "lane-stack" || len(normalized[0].ColumnIDs) != 2 ||
		normalized[0].ColumnIDs[0] != "col-a" || normalized[0].ColumnIDs[1] != "col-b" {
		t.Errorf("unexpected first lane: %+v", normalized[0])
	}
	if normalized[1].ID != "lane-col-d" || len(normalized[1].ColumnIDs) != 1 ||
		normalized[1].ColumnIDs[0] != "col-d" {
		t.Errorf("unexpected second lane: %+v", normalized[1])
	}
}
