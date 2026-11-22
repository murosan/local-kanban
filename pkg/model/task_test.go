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
		"非表示フィールド",
		"シークレット",
		"確認済み",
		"true",
		"false",
		"item-1",
		"削除済み候補",
		"preset-priority",
	}
	for _, unwanted := range mustNotContain {
		if strings.Contains(got, unwanted) {
			t.Errorf("expected extracted text NOT to contain %q, got:\n%s", unwanted, got)
		}
	}
}
