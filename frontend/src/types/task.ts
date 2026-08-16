export type CustomFieldType =
  'dropdown' | 'text' | 'number' | 'date' | 'checkbox' | 'link' | 'checklist';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface CustomFieldOption {
  id: string;
  value: string;
  color?: string;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: CustomFieldOption[];
}

export interface CustomFieldValue {
  id: string;
  field_id?: string;
  name: string;
  type: CustomFieldType;
  value: string | number | boolean | string[] | ChecklistItem[] | null;
  options?: CustomFieldOption[];
  enabled?: boolean;
}

export interface SubtaskRef {
  id: string;
  completed: boolean;
}

export interface Task {
  version?: number;
  id: string;
  parent_id?: string;
  title: string;
  column_id?: string;
  rank: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  custom_fields?: CustomFieldValue[];
  content?: string;
  summary?: string;
  file_path?: string;
  subtasks?: SubtaskRef[];
  subtasks_count?: number;
  subtasks_completed_count?: number;
  subtask_details?: Task[];
  completed?: boolean;
}

export interface Column {
  id: string;
  name: string;
  visible?: boolean;
  color?: string;
  order?: number;
}

export interface ThemeConfig {
  name: string;
  primaryBg?: string;
  cardBg?: string;
  accentColor?: string;
  textColor?: string;
}

export interface BoardConfig {
  version?: number;
  columns: Column[];
  custom_fields?: CustomFieldDef[];
  theme?: ThemeConfig;
  language?: string;
}
