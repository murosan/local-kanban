import type { Column, ColumnSettings } from "../types/task";

export function isColumnCardsVisible(column: Column): boolean {
	return column.settings?.show_cards !== false;
}

export function isColumnCardDetailsVisible(column: Column): boolean {
	return column.settings?.show_card_details !== false;
}

export function shouldRenderColumnCards(
	column: Column,
	options: { hasActiveSearch: boolean; matchedTaskCount: number },
): boolean {
	if (isColumnCardsVisible(column)) {
		return true;
	}
	return options.hasActiveSearch && options.matchedTaskCount > 0;
}

export function isTemporarilyExpandedBySearch(
	column: Column,
	options: { hasActiveSearch: boolean; matchedTaskCount: number },
): boolean {
	return (
		!isColumnCardsVisible(column) &&
		options.hasActiveSearch &&
		options.matchedTaskCount > 0
	);
}

export function updateColumnSettings(
	columns: Column[],
	columnId: string,
	patch: Partial<ColumnSettings>,
): Column[] {
	return columns.map((col) => {
		if (col.id !== columnId) return col;
		return {
			...col,
			settings: {
				show_cards: isColumnCardsVisible(col),
				show_card_details: isColumnCardDetailsVisible(col),
				...patch,
			},
		};
	});
}
