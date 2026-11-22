import { arrayMove } from "@dnd-kit/sortable";

export function reorderItemsById<T extends { id: string }>(
	items: readonly T[],
	activeId: string,
	overId: string,
): T[] {
	if (activeId === overId) {
		return items as T[];
	}
	const oldIndex = items.findIndex((item) => item.id === activeId);
	const newIndex = items.findIndex((item) => item.id === overId);
	if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
		return items as T[];
	}
	return arrayMove([...items], oldIndex, newIndex);
}

export function moveItemByOffset<T>(
	items: readonly T[],
	index: number,
	delta: -1 | 1,
): T[] {
	const targetIndex = index + delta;
	if (
		index < 0 ||
		index >= items.length ||
		targetIndex < 0 ||
		targetIndex >= items.length
	) {
		return items as T[];
	}
	return arrayMove([...items], index, targetIndex);
}

export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ensureUniqueIds<T extends { id: string }>(
	items: readonly T[],
	fallbackPrefix = "item",
): T[] {
	const seen = new Set<string>();
	let changed = false;
	const result = items.map((item, idx) => {
		const baseId = item.id?.trim() || `${fallbackPrefix}-${idx}`;
		let candidate = baseId;
		let suffix = 1;
		while (seen.has(candidate)) {
			candidate = `${baseId}-${suffix}`;
			suffix += 1;
		}
		seen.add(candidate);
		if (candidate !== item.id) {
			changed = true;
			return { ...item, id: candidate };
		}
		return item;
	});
	return changed ? result : (items as T[]);
}
