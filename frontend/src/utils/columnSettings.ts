import type { Column, ColumnSettings } from "../types/task";

export function isColumnArchived(column: Column): boolean {
	return column.archived === true;
}

export function isColumnActive(column: Column): boolean {
	return !isColumnArchived(column);
}

export function isColumnBoardVisible(column: Column): boolean {
	return isColumnActive(column) && column.visible !== false;
}

export function getActiveColumns(columns: Column[]): Column[] {
	return columns.filter(isColumnActive);
}

export function getArchivedColumns(columns: Column[]): Column[] {
	return columns.filter(isColumnArchived);
}

export function getDefaultActiveColumnId(columns: Column[]): string {
	const sorted = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const boardVisible = sorted.find(isColumnBoardVisible);
	if (boardVisible) return boardVisible.id;
	const active = sorted.find(isColumnActive);
	return active?.id ?? "";
}

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
