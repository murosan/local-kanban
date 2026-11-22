import type { ChecklistItem } from "../types/task";

/**
 * Normalizes a custom field value of type "checklist" into a ChecklistItem array
 * with guaranteed unique, non-empty IDs.
 * Returns the original array reference if all entries are already normalized.
 */
export const normalizeChecklistItems = (
	value: unknown,
	fallbackIdPrefix = "item",
): ChecklistItem[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	const usedIds = new Set<string>();
	let changed = false;
	const result: ChecklistItem[] = [];

	const allocateId = (candidate: string | undefined, index: number): string => {
		const trimmed = candidate?.trim();
		const base = trimmed || `${fallbackIdPrefix}-${index}`;
		if (!usedIds.has(base)) {
			usedIds.add(base);
			return base;
		}
		let suffix = 1;
		while (usedIds.has(`${base}-${suffix}`)) {
			suffix += 1;
		}
		const unique = `${base}-${suffix}`;
		usedIds.add(unique);
		return unique;
	};

	value.forEach((entry, index) => {
		if (typeof entry === "string") {
			changed = true;
			const trimmed = entry.trim();
			if (!trimmed) return;
			result.push({
				id: allocateId(undefined, index),
				text: trimmed,
				completed: false,
			});
			return;
		}

		if (entry && typeof entry === "object") {
			const record = entry as Record<string, unknown>;
			const rawId = typeof record.id === "string" ? record.id : undefined;
			const rawText = typeof record.text === "string" ? record.text : "";
			const rawCompleted =
				typeof record.completed === "boolean"
					? record.completed
					: Boolean(record.completed);

			const id = allocateId(rawId, index);
			if (
				id !== record.id ||
				typeof record.text !== "string" ||
				typeof record.completed !== "boolean"
			) {
				changed = true;
				result.push({
					id,
					text: rawText,
					completed: rawCompleted,
				});
			} else {
				result.push(entry as ChecklistItem);
			}
			return;
		}

		changed = true;
	});

	return changed ? result : (value as ChecklistItem[]);
};
