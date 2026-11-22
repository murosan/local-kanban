import { describe, expect, it } from "vitest";
import { ensureUniqueIds, moveItemByOffset, reorderItemsById } from "./reorder";

interface Item {
	id: string;
	name: string;
}

describe("reorder utils", () => {
	const baseItems: Item[] = [
		{ id: "cf-1", name: "Priority" },
		{ id: "cf-2", name: "Assignee" },
		{ id: "cf-3", name: "Due Date" },
	];

	describe("reorderItemsById", () => {
		it("moves an item down by id", () => {
			const result = reorderItemsById(baseItems, "cf-1", "cf-3");
			expect(result.map((i) => i.id)).toEqual(["cf-2", "cf-3", "cf-1"]);
		});

		it("moves an item up by id", () => {
			const result = reorderItemsById(baseItems, "cf-3", "cf-1");
			expect(result.map((i) => i.id)).toEqual(["cf-3", "cf-1", "cf-2"]);
		});

		it("returns original reference when activeId equals overId", () => {
			const result = reorderItemsById(baseItems, "cf-2", "cf-2");
			expect(result).toBe(baseItems);
		});

		it("returns original reference when an id is not found", () => {
			expect(reorderItemsById(baseItems, "missing", "cf-2")).toBe(baseItems);
			expect(reorderItemsById(baseItems, "cf-1", "missing")).toBe(baseItems);
		});
	});

	describe("moveItemByOffset", () => {
		it("moves an item up by one slot", () => {
			const result = moveItemByOffset(baseItems, 2, -1);
			expect(result.map((i) => i.id)).toEqual(["cf-1", "cf-3", "cf-2"]);
		});

		it("moves an item down by one slot", () => {
			const result = moveItemByOffset(baseItems, 0, 1);
			expect(result.map((i) => i.id)).toEqual(["cf-2", "cf-1", "cf-3"]);
		});

		it("returns original reference when moving past boundaries", () => {
			expect(moveItemByOffset(baseItems, 0, -1)).toBe(baseItems);
			expect(moveItemByOffset(baseItems, 2, 1)).toBe(baseItems);
			expect(moveItemByOffset(baseItems, -1, 1)).toBe(baseItems);
			expect(moveItemByOffset(baseItems, 5, -1)).toBe(baseItems);
		});
	});

	describe("ensureUniqueIds", () => {
		it("returns original reference when all ids are unique and non-empty", () => {
			expect(ensureUniqueIds(baseItems, "cf")).toBe(baseItems);
		});

		it("deduplicates duplicate and empty ids deterministically", () => {
			const items: Item[] = [
				{ id: "cf-1", name: "A" },
				{ id: "cf-1", name: "B" },
				{ id: "", name: "C" },
			];
			const result = ensureUniqueIds(items, "cf");
			expect(result.map((i) => i.id)).toEqual(["cf-1", "cf-1-1", "cf-2"]);
			expect(result.map((i) => i.name)).toEqual(["A", "B", "C"]);
		});
	});
});
