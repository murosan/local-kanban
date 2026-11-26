import type { BoardLane, Column } from "../types/task";
import { isColumnActive, isColumnBoardVisible } from "./columnSettings";

export interface ResolvedBoardLane {
	id: string;
	columns: Column[];
}

export interface BoardLayoutUpdate {
	columns: Column[];
	lanes: BoardLane[];
}

function makeUniqueLaneId(usedIds: Set<string>, baseId: string): string {
	const trimmed = baseId.trim() || "lane";
	if (!usedIds.has(trimmed)) {
		usedIds.add(trimmed);
		return trimmed;
	}
	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${trimmed}-${suffix}`;
		if (!usedIds.has(candidate)) {
			usedIds.add(candidate);
			return candidate;
		}
	}
}

/**
 * Sanitizes BoardConfig.lanes against active (non-archived) columns:
 * - Drops archived, deleted, and duplicate column IDs.
 * - Drops empty lanes.
 * - Appends any unplaced active columns (sorted by Column.order) as standalone lanes.
 */
export function normalizeBoardLanes(
	columns: Column[],
	lanes?: BoardLane[],
): BoardLane[] {
	const activeColumns = columns
		.filter(isColumnActive)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const activeSet = new Set(activeColumns.map((col) => col.id));

	const usedColIds = new Set<string>();
	const usedLaneIds = new Set<string>();
	const normalized: BoardLane[] = [];

	if (lanes && lanes.length > 0) {
		for (const lane of lanes) {
			const colIds: string[] = [];
			for (const colId of lane.column_ids ?? []) {
				if (activeSet.has(colId) && !usedColIds.has(colId)) {
					usedColIds.add(colId);
					colIds.push(colId);
				}
			}
			if (colIds.length === 0) continue;
			normalized.push({
				id: makeUniqueLaneId(usedLaneIds, lane.id || `lane-${colIds[0]}`),
				column_ids: colIds,
			});
		}
	}

	for (const col of activeColumns) {
		if (usedColIds.has(col.id)) continue;
		usedColIds.add(col.id);
		normalized.push({
			id: makeUniqueLaneId(usedLaneIds, `lane-${col.id}`),
			column_ids: [col.id],
		});
	}

	return normalized;
}

/**
 * Synchronizes Column.order (1-based) to match lane order (left-to-right, top-to-bottom),
 * followed by archived columns in their existing relative order.
 */
export function syncColumnOrderFromLanes(
	columns: Column[],
	lanes: BoardLane[],
): Column[] {
	const normalizedLanes = normalizeBoardLanes(columns, lanes);
	const colById = new Map(columns.map((col) => [col.id, col]));
	const ordered: Column[] = [];
	const seen = new Set<string>();

	for (const lane of normalizedLanes) {
		for (const colId of lane.column_ids) {
			const col = colById.get(colId);
			if (col && !seen.has(col.id)) {
				seen.add(col.id);
				ordered.push(col);
			}
		}
	}

	for (const col of columns) {
		if (!seen.has(col.id)) {
			seen.add(col.id);
			ordered.push(col);
		}
	}

	return ordered.map((col, idx) => ({
		...col,
		order: idx + 1,
	}));
}

/**
 * Resolves lanes for rendering on the board: only active, board-visible columns are kept,
 * and lanes with no visible columns are omitted (preserving hidden columns' lane membership in config).
 */
export function getVisibleBoardLanes(
	columns: Column[],
	lanes?: BoardLane[],
): ResolvedBoardLane[] {
	const normalized = normalizeBoardLanes(columns, lanes);
	const colById = new Map(columns.map((col) => [col.id, col]));
	const result: ResolvedBoardLane[] = [];

	for (const lane of normalized) {
		const visibleCols: Column[] = [];
		for (const colId of lane.column_ids) {
			const col = colById.get(colId);
			if (col && isColumnBoardVisible(col)) {
				visibleCols.push(col);
			}
		}
		if (visibleCols.length > 0) {
			result.push({
				id: lane.id,
				columns: visibleCols,
			});
		}
	}

	return result;
}

function getVisibleLaneIndices(
	lanes: BoardLane[],
	colById: Map<string, Column>,
): number[] {
	const indices: number[] = [];
	lanes.forEach((lane, idx) => {
		const hasVisible = lane.column_ids.some((id) => {
			const col = colById.get(id);
			return Boolean(col && isColumnBoardVisible(col));
		});
		if (hasVisible) {
			indices.push(idx);
		}
	});
	return indices;
}

/**
 * Moves a lane left (-1) or right (+1) relative to visible lanes on the board.
 */
export function moveLaneByOffset(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	laneId: string,
	delta: -1 | 1,
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	const colById = new Map(columns.map((col) => [col.id, col]));
	const visibleIndices = getVisibleLaneIndices(normalized, colById);
	const currentLaneIndex = normalized.findIndex((lane) => lane.id === laneId);
	if (currentLaneIndex === -1) {
		return { columns, lanes: normalized };
	}

	const visPos = visibleIndices.indexOf(currentLaneIndex);
	if (visPos === -1) {
		return { columns, lanes: normalized };
	}
	const targetVisPos = visPos + delta;
	if (targetVisPos < 0 || targetVisPos >= visibleIndices.length) {
		return { columns, lanes: normalized };
	}

	const targetLaneIndex = visibleIndices[targetVisPos];
	const nextLanes = [...normalized];
	const [moved] = nextLanes.splice(currentLaneIndex, 1);
	nextLanes.splice(targetLaneIndex, 0, moved);

	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Reorders lanes by dragging activeLaneId onto overLaneId.
 */
export function reorderLanesById(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	activeLaneId: string,
	overLaneId: string,
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	if (activeLaneId === overLaneId) {
		return { columns, lanes: normalized };
	}
	const fromIndex = normalized.findIndex((lane) => lane.id === activeLaneId);
	const toIndex = normalized.findIndex((lane) => lane.id === overLaneId);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
		return { columns, lanes: normalized };
	}

	const nextLanes = [...normalized];
	const [moved] = nextLanes.splice(fromIndex, 1);
	nextLanes.splice(toIndex, 0, moved);

	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Moves a column up (-1) or down (+1) within its lane (relative to visible columns in that lane).
 */
export function moveColumnInLaneByOffset(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	columnId: string,
	delta: -1 | 1,
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	const colById = new Map(columns.map((col) => [col.id, col]));
	const laneIndex = normalized.findIndex((lane) =>
		lane.column_ids.includes(columnId),
	);
	if (laneIndex === -1) {
		return { columns, lanes: normalized };
	}

	const lane = normalized[laneIndex];
	const visibleColIndices: number[] = [];
	lane.column_ids.forEach((id, idx) => {
		const col = colById.get(id);
		if (col && isColumnBoardVisible(col)) {
			visibleColIndices.push(idx);
		}
	});

	const currentColIdx = lane.column_ids.indexOf(columnId);
	const visPos = visibleColIndices.indexOf(currentColIdx);
	if (visPos === -1) {
		return { columns, lanes: normalized };
	}
	const targetVisPos = visPos + delta;
	if (targetVisPos < 0 || targetVisPos >= visibleColIndices.length) {
		return { columns, lanes: normalized };
	}

	const targetColIdx = visibleColIndices[targetVisPos];
	const nextColIds = [...lane.column_ids];
	const [moved] = nextColIds.splice(currentColIdx, 1);
	nextColIds.splice(targetColIdx, 0, moved);

	const nextLanes = normalized.map((l, idx) =>
		idx === laneIndex ? { ...l, column_ids: nextColIds } : l,
	);

	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Reorders columns within the same lane by dragging activeColumnId onto overColumnId.
 */
export function reorderColumnInLaneById(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	laneId: string,
	activeColumnId: string,
	overColumnId: string,
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	if (activeColumnId === overColumnId) {
		return { columns, lanes: normalized };
	}
	const laneIndex = normalized.findIndex((lane) => lane.id === laneId);
	if (laneIndex === -1) {
		return { columns, lanes: normalized };
	}

	const lane = normalized[laneIndex];
	const fromIndex = lane.column_ids.indexOf(activeColumnId);
	const toIndex = lane.column_ids.indexOf(overColumnId);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
		return { columns, lanes: normalized };
	}

	const nextColIds = [...lane.column_ids];
	const [moved] = nextColIds.splice(fromIndex, 1);
	nextColIds.splice(toIndex, 0, moved);

	const nextLanes = normalized.map((l, idx) =>
		idx === laneIndex ? { ...l, column_ids: nextColIds } : l,
	);

	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Stacks columnId into the adjacent visible lane to the left or right (appended at the bottom).
 */
export function stackColumnIntoAdjacentLane(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	columnId: string,
	direction: "left" | "right",
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	const colById = new Map(columns.map((col) => [col.id, col]));
	const sourceLaneIdx = normalized.findIndex((lane) =>
		lane.column_ids.includes(columnId),
	);
	if (sourceLaneIdx === -1) {
		return { columns, lanes: normalized };
	}

	const visibleIndices = getVisibleLaneIndices(normalized, colById);
	const visPos = visibleIndices.indexOf(sourceLaneIdx);
	if (visPos === -1) {
		return { columns, lanes: normalized };
	}
	const targetVisPos = direction === "left" ? visPos - 1 : visPos + 1;
	if (targetVisPos < 0 || targetVisPos >= visibleIndices.length) {
		return { columns, lanes: normalized };
	}
	const targetLaneIdx = visibleIndices[targetVisPos];

	const nextLanes = normalized
		.map((lane, idx) => {
			if (idx === sourceLaneIdx) {
				return {
					...lane,
					column_ids: lane.column_ids.filter((id) => id !== columnId),
				};
			}
			if (idx === targetLaneIdx) {
				return {
					...lane,
					column_ids: [...lane.column_ids, columnId],
				};
			}
			return lane;
		})
		.filter((lane) => lane.column_ids.length > 0);

	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Splits columnId out of a stacked lane into its own standalone lane immediately to the right.
 */
export function unstackColumn(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	columnId: string,
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	const sourceLaneIdx = normalized.findIndex((lane) =>
		lane.column_ids.includes(columnId),
	);
	if (sourceLaneIdx === -1) {
		return { columns, lanes: normalized };
	}
	const sourceLane = normalized[sourceLaneIdx];
	if (sourceLane.column_ids.length <= 1) {
		return { columns, lanes: normalized };
	}

	const usedLaneIds = new Set(normalized.map((lane) => lane.id));
	const newLane: BoardLane = {
		id: makeUniqueLaneId(usedLaneIds, `lane-${columnId}`),
		column_ids: [columnId],
	};

	const nextLanes = [...normalized];
	nextLanes[sourceLaneIdx] = {
		...sourceLane,
		column_ids: sourceLane.column_ids.filter((id) => id !== columnId),
	};
	nextLanes.splice(sourceLaneIdx + 1, 0, newLane);

	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Archives a column (removes it from lanes, records archived_at, and preserves its settings/tasks).
 */
export function archiveColumnInConfig(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	columnId: string,
	archivedAt: string = new Date().toISOString(),
): BoardLayoutUpdate {
	const nextColumns = columns.map((col) =>
		col.id === columnId
			? {
					...col,
					archived: true,
					archived_at: archivedAt,
				}
			: col,
	);
	const nextLanes = normalizeBoardLanes(nextColumns, lanes);
	return {
		columns: syncColumnOrderFromLanes(nextColumns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Restores an archived column back to active & visible, appending it as a standalone lane at the end.
 */
export function unarchiveColumnInConfig(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	columnId: string,
): BoardLayoutUpdate {
	const nextColumns = columns.map((col) => {
		if (col.id !== columnId) return col;
		const { archived_at: _removed, ...rest } = col;
		return {
			...rest,
			archived: false,
			visible: true,
		};
	});
	const nextLanes = normalizeBoardLanes(nextColumns, lanes);
	return {
		columns: syncColumnOrderFromLanes(nextColumns, nextLanes),
		lanes: nextLanes,
	};
}

/**
 * Moves an active column up (-1) or down (+1) in the Column Manager modal while keeping lanes consistent:
 * - If inside a stacked lane and moving within its bounds, reorders inside the lane.
 * - Otherwise moves the column's lane up/down past the adjacent lane.
 */
export function moveColumnInConfigModal(
	columns: Column[],
	lanes: BoardLane[] | undefined,
	columnId: string,
	delta: -1 | 1,
): BoardLayoutUpdate {
	const normalized = normalizeBoardLanes(columns, lanes);
	const laneIdx = normalized.findIndex((lane) =>
		lane.column_ids.includes(columnId),
	);
	if (laneIdx === -1) {
		return { columns, lanes: normalized };
	}

	const lane = normalized[laneIdx];
	const colIdx = lane.column_ids.indexOf(columnId);
	const targetColIdx = colIdx + delta;

	if (
		lane.column_ids.length > 1 &&
		targetColIdx >= 0 &&
		targetColIdx < lane.column_ids.length
	) {
		const nextColIds = [...lane.column_ids];
		const [moved] = nextColIds.splice(colIdx, 1);
		nextColIds.splice(targetColIdx, 0, moved);
		const nextLanes = normalized.map((l, idx) =>
			idx === laneIdx ? { ...l, column_ids: nextColIds } : l,
		);
		return {
			columns: syncColumnOrderFromLanes(columns, nextLanes),
			lanes: nextLanes,
		};
	}

	const targetLaneIdx = laneIdx + delta;
	if (targetLaneIdx < 0 || targetLaneIdx >= normalized.length) {
		return { columns, lanes: normalized };
	}

	const nextLanes = [...normalized];
	const [movedLane] = nextLanes.splice(laneIdx, 1);
	nextLanes.splice(targetLaneIdx, 0, movedLane);
	return {
		columns: syncColumnOrderFromLanes(columns, nextLanes),
		lanes: nextLanes,
	};
}
