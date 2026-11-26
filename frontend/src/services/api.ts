import type {
	BoardConfig,
	CustomFieldValue,
	SubtaskRef,
	Task,
} from "../types/task";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function parseApiError(res: Response, fallback: string): Promise<Error> {
	try {
		const data = (await res.json()) as { error?: string };
		if (data?.error) {
			return new Error(data.error);
		}
	} catch {
		// ignore non-JSON error body
	}
	return new Error(fallback);
}

export async function fetchBoardConfig(): Promise<BoardConfig> {
	const res = await fetch(`${API_BASE}/config`);
	if (!res.ok) throw await parseApiError(res, "Failed to fetch board config");
	return res.json();
}

export async function saveBoardConfig(
	config: BoardConfig,
): Promise<BoardConfig> {
	const res = await fetch(`${API_BASE}/config`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(config),
	});
	if (!res.ok) throw await parseApiError(res, "Failed to save board config");
	return res.json();
}

export interface FetchTasksOptions {
	includeHidden?: boolean;
	includeArchived?: boolean;
}

export async function fetchTasks(
	query?: string,
	options?: FetchTasksOptions,
): Promise<Task[]> {
	const params = new URLSearchParams();
	if (query) {
		params.set("q", query);
	}
	if (options?.includeHidden) {
		params.set("include_hidden", "true");
	}
	if (options?.includeArchived) {
		params.set("include_archived", "true");
	}
	const qs = params.toString();
	const url = qs ? `${API_BASE}/tasks?${qs}` : `${API_BASE}/tasks`;
	const res = await fetch(url);
	if (!res.ok) throw await parseApiError(res, "Failed to fetch tasks");
	const data = await res.json();
	return data || [];
}

export async function fetchTaskById(id: string): Promise<Task> {
	const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}`);
	if (!res.ok) throw await parseApiError(res, "Failed to fetch task detail");
	return res.json();
}

export async function fetchTags(): Promise<string[]> {
	const res = await fetch(`${API_BASE}/tags`);
	if (!res.ok) throw await parseApiError(res, "Failed to fetch tags");
	const data = await res.json();
	return data || [];
}

export interface CreateTaskPayload {
	parent_id?: string;
	title: string;
	column_id?: string;
	tags?: string[];
	custom_fields?: CustomFieldValue[];
	subtasks?: SubtaskRef[];
	content?: string;
	prev_id?: string;
	next_id?: string;
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
	const res = await fetch(`${API_BASE}/tasks`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw await parseApiError(res, "Failed to create task");
	return res.json();
}

export interface UpdateTaskPayload {
	parent_id?: string;
	title?: string;
	column_id?: string;
	tags?: string[];
	custom_fields?: CustomFieldValue[];
	subtasks?: SubtaskRef[];
	content?: string;
	rank?: string;
	prev_id?: string;
	next_id?: string;
}

export async function updateTask(
	id: string,
	payload: UpdateTaskPayload,
): Promise<Task> {
	const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw await parseApiError(res, "Failed to update task");
	return res.json();
}

export async function deleteTask(id: string): Promise<void> {
	const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	if (!res.ok) throw await parseApiError(res, "Failed to delete task");
}

export interface DuplicateTaskPayload {
	title?: string;
	column_id?: string;
	include_subtasks?: boolean;
}

export async function duplicateTask(
	id: string,
	payload?: DuplicateTaskPayload,
): Promise<Task> {
	const res = await fetch(
		`${API_BASE}/tasks/${encodeURIComponent(id)}/duplicate`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: payload ? JSON.stringify(payload) : undefined,
		},
	);
	if (!res.ok) throw await parseApiError(res, "Failed to duplicate task");
	return res.json();
}

export async function rebuildCache(): Promise<{
	message: string;
	count: number;
}> {
	const res = await fetch(`${API_BASE}/rebuild`, {
		method: "POST",
	});
	if (!res.ok)
		throw await parseApiError(res, "Failed to rebuild database cache");
	return res.json();
}
