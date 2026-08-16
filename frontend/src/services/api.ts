import { BoardConfig, CustomFieldValue, Task } from '../types/task';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function fetchBoardConfig(): Promise<BoardConfig> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error('Failed to fetch board config');
  return res.json();
}

export async function saveBoardConfig(config: BoardConfig): Promise<BoardConfig> {
  const res = await fetch(`${API_BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save board config');
  return res.json();
}

export async function fetchTasks(query?: string): Promise<Task[]> {
  const url = query ? `${API_BASE}/tasks?q=${encodeURIComponent(query)}` : `${API_BASE}/tasks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  const data = await res.json();
  return data || [];
}

export async function fetchTaskById(id: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Failed to fetch task detail');
  return res.json();
}

export async function fetchTags(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/tags`);
  if (!res.ok) throw new Error('Failed to fetch tags');
  const data = await res.json();
  return data || [];
}

export interface CreateTaskPayload {
  title: string;
  column_id?: string;
  tags?: string[];
  custom_fields?: CustomFieldValue[];
  content?: string;
  prev_id?: string;
  next_id?: string;
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export interface UpdateTaskPayload {
  title?: string;
  column_id?: string;
  tags?: string[];
  custom_fields?: CustomFieldValue[];
  content?: string;
  rank?: string;
  prev_id?: string;
  next_id?: string;
}

export async function updateTask(id: string, payload: UpdateTaskPayload): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tasks/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete task');
}

export async function rebuildCache(): Promise<{ message: string; count: number }> {
  const res = await fetch(`${API_BASE}/rebuild`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to rebuild database cache');
  return res.json();
}
