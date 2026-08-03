export type CustomFieldType = 'dropdown' | 'text' | 'number' | 'date' | 'checkbox' | 'link';

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
  field_id: string;
  value: string | number | boolean | string[] | null;
  enabled: boolean;
}

export interface Task {
  id: string;
  title: string;
  column_id?: string;
  rank: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, CustomFieldValue>;
  content?: string;
  summary?: string;
  file_path?: string;
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
