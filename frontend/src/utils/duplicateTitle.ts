const escapeRegExp = (str: string): string =>
	str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Generates a clean title for a duplicated card.
 * - "Task" + "Copy" -> "Task (Copy)"
 * - "Task (Copy)" + "Copy" -> "Task (Copy 2)"
 * - "Task (Copy 2)" + "Copy" -> "Task (Copy 3)"
 * - "タスク" + "コピー" -> "タスク (コピー)"
 * - "タスク (コピー)" + "コピー" -> "タスク (コピー 2)"
 */
export const buildDuplicateTitle = (
	originalTitle: string,
	copyLabel: string,
): string => {
	const trimmedTitle = originalTitle.trim();
	const trimmedLabel = copyLabel.trim() || "Copy";
	if (!trimmedTitle) {
		return trimmedLabel;
	}

	const escapedLabel = escapeRegExp(trimmedLabel);
	const pattern = new RegExp(`^(.*?)\\s*\\(${escapedLabel}(?:\\s+(\\d+))?\\)$`);
	const match = trimmedTitle.match(pattern);
	if (match) {
		const baseTitle = match[1].trim();
		const currentNumber = match[2] ? Number.parseInt(match[2], 10) : 1;
		const nextNumber =
			Number.isFinite(currentNumber) && currentNumber >= 1
				? currentNumber + 1
				: 2;
		return baseTitle
			? `${baseTitle} (${trimmedLabel} ${nextNumber})`
			: `(${trimmedLabel} ${nextNumber})`;
	}

	return `${trimmedTitle} (${trimmedLabel})`;
};
