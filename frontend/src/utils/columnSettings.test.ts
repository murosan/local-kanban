import { describe, expect, it } from "vitest";
import type { Column } from "../types/task";
import {
	isColumnCardDetailsVisible,
	isColumnCardsVisible,
	isTemporarilyExpandedBySearch,
	shouldRenderColumnCards,
	updateColumnSettings,
} from "./columnSettings";

const makeColumn = (overrides: Partial<Column> = {}): Column => ({
	id: "col-1",
	name: "Todo",
	visible: true,
	order: 1,
	...overrides,
});

describe("columnSettings", () => {
	it("defaults show_cards and show_card_details to true when settings are omitted", () => {
		const col = makeColumn();
		expect(isColumnCardsVisible(col)).toBe(true);
		expect(isColumnCardDetailsVisible(col)).toBe(true);
	});

	it("respects explicit false settings", () => {
		const col = makeColumn({
			settings: { show_cards: false, show_card_details: false },
		});
		expect(isColumnCardsVisible(col)).toBe(false);
		expect(isColumnCardDetailsVisible(col)).toBe(false);
	});

	it("hides cards when show_cards is false and no search hits exist", () => {
		const col = makeColumn({ settings: { show_cards: false } });
		expect(
			shouldRenderColumnCards(col, {
				hasActiveSearch: false,
				matchedTaskCount: 5,
			}),
		).toBe(false);
		expect(
			shouldRenderColumnCards(col, {
				hasActiveSearch: true,
				matchedTaskCount: 0,
			}),
		).toBe(false);
		expect(
			isTemporarilyExpandedBySearch(col, {
				hasActiveSearch: true,
				matchedTaskCount: 0,
			}),
		).toBe(false);
	});

	it("temporarily shows cards when show_cards is false and search matches tasks in the column", () => {
		const col = makeColumn({ settings: { show_cards: false } });
		expect(
			shouldRenderColumnCards(col, {
				hasActiveSearch: true,
				matchedTaskCount: 2,
			}),
		).toBe(true);
		expect(
			isTemporarilyExpandedBySearch(col, {
				hasActiveSearch: true,
				matchedTaskCount: 2,
			}),
		).toBe(true);
	});

	it("does not mark normally visible columns as temporarily expanded by search", () => {
		const col = makeColumn({ settings: { show_cards: true } });
		expect(
			shouldRenderColumnCards(col, {
				hasActiveSearch: true,
				matchedTaskCount: 2,
			}),
		).toBe(true);
		expect(
			isTemporarilyExpandedBySearch(col, {
				hasActiveSearch: true,
				matchedTaskCount: 2,
			}),
		).toBe(false);
	});

	it("updates only the target column settings while preserving sibling columns and other setting fields", () => {
		const columns: Column[] = [
			makeColumn({ id: "col-1", name: "Todo" }),
			makeColumn({
				id: "col-2",
				name: "Done",
				settings: { show_cards: false, show_card_details: true },
			}),
		];

		const updated = updateColumnSettings(columns, "col-2", {
			show_card_details: false,
		});

		expect(updated[0]).toBe(columns[0]);
		expect(updated[1].settings).toEqual({
			show_cards: false,
			show_card_details: false,
		});
		// Does not mutate original array
		expect(columns[1].settings?.show_card_details).toBe(true);
	});
});
