export type TaskStatus = 'Todo' | 'In Progress' | 'Review' | 'Done';

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
}

export interface BoardConfig {
  columns: Column[];
}
