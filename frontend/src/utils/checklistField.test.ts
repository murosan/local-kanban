import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "../types/task";
import { normalizeChecklistItems } from "./checklistField";
import { moveItemByOffset, reorderItemsById } from "./reorder";

describe("checklistField utils", () => {
	describe("normalizeChecklistItems", () => {
		it("returns original reference when items already have valid unique IDs", () => {
			const items: ChecklistItem[] = [
				{ id: "item-1", text: "Design", completed: true },
				{ id: "item-2", text: "Implement", completed: false },
			];
			expect(normalizeChecklistItems(items, "chk")).toBe(items);
		});

		it("deduplicates duplicate and missing IDs deterministically", () => {
			const raw = [
				{ id: "dup", text: "First", completed: true },
				{ id: "dup", text: "Second", completed: false },
				{ id: "", text: "Third", completed: false },
				{ text: "Fourth", completed: true },
			];
			expect(normalizeChecklistItems(raw, "chk")).toEqual([
				{ id: "dup", text: "First", completed: true },
				{ id: "dup-1", text: "Second", completed: false },
				{ id: "chk-2", text: "Third", completed: false },
				{ id: "chk-3", text: "Fourth", completed: true },
			]);
		});

		it("normalizes legacy string arrays and skips invalid entries", () => {
			const raw = ["Step 1", "  Step 2  ", "", null, 42];
			expect(normalizeChecklistItems(raw, "chk")).toEqual([
				{ id: "chk-0", text: "Step 1", completed: false },
				{ id: "chk-1", text: "Step 2", completed: false },
			]);
		});

		it("returns empty array for non-array values", () => {
			expect(normalizeChecklistItems(null)).toEqual([]);
			expect(normalizeChecklistItems(undefined)).toEqual([]);
			expect(normalizeChecklistItems("not-an-array")).toEqual([]);
		});
	});

	describe("reordering checklist items", () => {
		const items: ChecklistItem[] = [
			{ id: "item-1", text: "Spec", completed: true },
			{ id: "item-2", text: "Code", completed: false },
			{ id: "item-3", text: "Test", completed: true },
		];

		it("reorders checklist items by drag ID while preserving completed state", () => {
			const reordered = reorderItemsById(items, "item-1", "item-3");
			expect(reordered).toEqual([
				{ id: "item-2", text: "Code", completed: false },
				{ id: "item-3", text: "Test", completed: true },
				{ id: "item-1", text: "Spec", completed: true },
			]);
		});

		it("moves checklist items by offset while preserving text and completed state", () => {
			const movedUp = moveItemByOffset(items, 2, -1);
			expect(movedUp.map((i) => i.id)).toEqual(["item-1", "item-3", "item-2"]);
			expect(movedUp[1]).toEqual({
				id: "item-3",
				text: "Test",
				completed: true,
			});

			const movedDown = moveItemByOffset(items, 0, 1);
			expect(movedDown.map((i) => i.id)).toEqual([
				"item-2",
				"item-1",
				"item-3",
			]);
		});
	});
});
