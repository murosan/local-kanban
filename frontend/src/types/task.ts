export type TaskStatus = string;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  rank: string;
  tags?: string[];
  assignee?: string;
  created_at: string;
  updated_at: string;
  slack_links?: string[];
  content: string;
  file_path?: string;
}

export interface Column {
  id: string;
  title: string;
  status: TaskStatus;
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

export interface StatusItem {
  id: string;
  name: string;
  color?: string;
}

export interface BoardConfig {
  columns: Column[];
  statuses?: StatusItem[];
  theme?: ThemeConfig;
  language?: string;
}
