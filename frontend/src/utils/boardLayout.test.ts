import { describe, expect, it } from "vitest";
import type { BoardLane, Column } from "../types/task";
import {
	archiveColumnInConfig,
	getVisibleBoardLanes,
	moveColumnInConfigModal,
	moveColumnInLaneByOffset,
	moveLaneByOffset,
	normalizeBoardLanes,
	reorderColumnInLaneById,
	reorderLanesById,
	stackColumnIntoAdjacentLane,
	unarchiveColumnInConfig,
	unstackColumn,
} from "./boardLayout";

const makeColumn = (
	id: string,
	order: number,
	overrides: Partial<Column> = {},
): Column => ({
	id,
	name: id.toUpperCase(),
	visible: true,
	order,
	...overrides,
});

describe("boardLayout", () => {
	const baseColumns: Column[] = [
		makeColumn("todo", 1),
		makeColumn("doing", 2),
		makeColumn("review", 3),
		makeColumn("done", 4),
	];

	describe("normalizeBoardLanes", () => {
		it("derives 1-column lanes in order when lanes are omitted", () => {
			const lanes = normalizeBoardLanes([
				makeColumn("done", 4),
				makeColumn("todo", 1),
				makeColumn("archived", 2, { archived: true }),
				makeColumn("doing", 3),
			]);
			expect(lanes).toEqual([
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-doing", column_ids: ["doing"] },
				{ id: "lane-done", column_ids: ["done"] },
			]);
		});

		it("strips archived, deleted, and duplicate IDs and appends unplaced active columns", () => {
			const cols = [
				makeColumn("todo", 1),
				makeColumn("doing", 2),
				makeColumn("archived", 3, { archived: true }),
				makeColumn("done", 4),
			];
			const rawLanes: BoardLane[] = [
				{ id: "lane-a", column_ids: ["todo", "archived", "missing", "todo"] },
				{ id: "lane-empty", column_ids: ["archived"] },
			];
			expect(normalizeBoardLanes(cols, rawLanes)).toEqual([
				{ id: "lane-a", column_ids: ["todo"] },
				{ id: "lane-doing", column_ids: ["doing"] },
				{ id: "lane-done", column_ids: ["done"] },
			]);
		});
	});

	describe("getVisibleBoardLanes", () => {
		it("omits hidden columns while preserving lane membership", () => {
			const cols = [
				makeColumn("todo", 1),
				makeColumn("hidden", 2, { visible: false }),
				makeColumn("review", 3),
				makeColumn("hidden-only", 4, { visible: false }),
			];
			const lanes: BoardLane[] = [
				{ id: "lane-1", column_ids: ["todo", "hidden", "review"] },
				{ id: "lane-2", column_ids: ["hidden-only"] },
			];
			const visible = getVisibleBoardLanes(cols, lanes);
			expect(visible).toHaveLength(1);
			expect(visible[0].id).toBe("lane-1");
			expect(visible[0].columns.map((c) => c.id)).toEqual(["todo", "review"]);
		});
	});

	describe("lane reordering", () => {
		it("moves a lane left/right skipping hidden-only lanes and updates column order", () => {
			const cols = [
				makeColumn("todo", 1),
				makeColumn("hidden", 2, { visible: false }),
				makeColumn("doing", 3),
				makeColumn("done", 4),
			];
			const lanes = normalizeBoardLanes(cols);

			const movedLeft = moveLaneByOffset(cols, lanes, "lane-doing", -1);
			expect(movedLeft.lanes.map((l) => l.column_ids)).toEqual([
				["doing"],
				["todo"],
				["hidden"],
				["done"],
			]);
			expect(movedLeft.columns.map((c) => c.id)).toEqual([
				"doing",
				"todo",
				"hidden",
				"done",
			]);
			expect(movedLeft.columns.map((c) => c.order)).toEqual([1, 2, 3, 4]);
		});

		it("reorders lanes by drag IDs", () => {
			const lanes = normalizeBoardLanes(baseColumns);
			const res = reorderLanesById(
				baseColumns,
				lanes,
				"lane-todo",
				"lane-review",
			);
			expect(res.lanes.map((l) => l.id)).toEqual([
				"lane-doing",
				"lane-review",
				"lane-todo",
				"lane-done",
			]);
			expect(res.columns.map((c) => c.id)).toEqual([
				"doing",
				"review",
				"todo",
				"done",
			]);
		});
	});

	describe("vertical stacking and unstacking", () => {
		it("stacks a column into the left or right adjacent lane", () => {
			const lanes = normalizeBoardLanes(baseColumns);
			const stacked = stackColumnIntoAdjacentLane(
				baseColumns,
				lanes,
				"review",
				"left",
			);
			expect(stacked.lanes).toEqual([
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-doing", column_ids: ["doing", "review"] },
				{ id: "lane-done", column_ids: ["done"] },
			]);
			expect(stacked.columns.map((c) => c.id)).toEqual([
				"todo",
				"doing",
				"review",
				"done",
			]);
		});

		it("reorders stacked columns vertically by offset and by drag IDs", () => {
			const stackedLanes: BoardLane[] = [
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-work", column_ids: ["doing", "review", "done"] },
			];

			const movedUp = moveColumnInLaneByOffset(
				baseColumns,
				stackedLanes,
				"done",
				-1,
			);
			expect(movedUp.lanes[1].column_ids).toEqual(["doing", "done", "review"]);

			const dragged = reorderColumnInLaneById(
				movedUp.columns,
				movedUp.lanes,
				"lane-work",
				"review",
				"doing",
			);
			expect(dragged.lanes[1].column_ids).toEqual(["review", "doing", "done"]);
		});

		it("unstacks a column into a new standalone lane immediately to the right", () => {
			const stackedLanes: BoardLane[] = [
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-work", column_ids: ["doing", "review"] },
				{ id: "lane-done", column_ids: ["done"] },
			];

			const unstacked = unstackColumn(baseColumns, stackedLanes, "review");
			expect(unstacked.lanes).toEqual([
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-work", column_ids: ["doing"] },
				{ id: "lane-review", column_ids: ["review"] },
				{ id: "lane-done", column_ids: ["done"] },
			]);
		});
	});

	describe("archive and unarchive", () => {
		it("archives a column, strips it from lanes, and restores it as a standalone lane at the end", () => {
			const stackedLanes: BoardLane[] = [
				{ id: "lane-work", column_ids: ["todo", "doing"] },
				{ id: "lane-done", column_ids: ["review", "done"] },
			];

			const archived = archiveColumnInConfig(
				baseColumns,
				stackedLanes,
				"doing",
				"2026-11-27T00:00:00Z",
			);
			const archivedCol = archived.columns.find((c) => c.id === "doing");
			expect(archivedCol?.archived).toBe(true);
			expect(archivedCol?.archived_at).toBe("2026-11-27T00:00:00Z");
			expect(archived.lanes).toEqual([
				{ id: "lane-work", column_ids: ["todo"] },
				{ id: "lane-done", column_ids: ["review", "done"] },
			]);

			const restored = unarchiveColumnInConfig(
				archived.columns,
				archived.lanes,
				"doing",
			);
			const restoredCol = restored.columns.find((c) => c.id === "doing");
			expect(restoredCol?.archived).toBe(false);
			expect(restoredCol?.archived_at).toBeUndefined();
			expect(restoredCol?.visible).toBe(true);
			expect(restored.lanes).toEqual([
				{ id: "lane-work", column_ids: ["todo"] },
				{ id: "lane-done", column_ids: ["review", "done"] },
				{ id: "lane-doing", column_ids: ["doing"] },
			]);
		});

		it("allows archiving all columns leaving empty lanes", () => {
			const oneCol = [makeColumn("todo", 1)];
			const archived = archiveColumnInConfig(oneCol, undefined, "todo");
			expect(archived.lanes).toEqual([]);
			expect(archived.columns[0].archived).toBe(true);
		});
	});

	describe("moveColumnInConfigModal", () => {
		it("reorders inside stacked lane first, then moves lane at edges", () => {
			const stackedLanes: BoardLane[] = [
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-work", column_ids: ["doing", "review"] },
			];

			const step1 = moveColumnInConfigModal(
				baseColumns.slice(0, 3),
				stackedLanes,
				"review",
				-1,
			);
			expect(step1.lanes).toEqual([
				{ id: "lane-todo", column_ids: ["todo"] },
				{ id: "lane-work", column_ids: ["review", "doing"] },
			]);

			const step2 = moveColumnInConfigModal(
				step1.columns,
				step1.lanes,
				"review",
				-1,
			);
			expect(step2.lanes).toEqual([
				{ id: "lane-work", column_ids: ["review", "doing"] },
				{ id: "lane-todo", column_ids: ["todo"] },
			]);
		});
	});
});
