export const INDENT_UNIT = "  ";

/**
 * Matches when text from line start up to the cursor consists solely of
 * optional leading indentation followed by a Markdown list marker:
 * - Task list: `- [ ] `, `- [x] `, `* [X]`, `+ [ ] `, etc.
 * - Unordered list: `- `, `* `, `+ `
 * - Ordered list: `1. `, `2) `, etc.
 */
const LIST_MARKER_BEFORE_CURSOR_REGEX =
	/^[ \t]*(?:[-*+][ \t]+\[[ xX]\][ \t]*|[-*+][ \t]+|\d+[.)][ \t]+)$/;

export interface TabIndentResult {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

const getLineStart = (value: string, pos: number): number =>
	pos <= 0 ? 0 : value.lastIndexOf("\n", pos - 1) + 1;

/**
 * Returns how many leading characters to remove for a single outdent step:
 * up to INDENT_UNIT.length (2) spaces, or 1 tab character.
 */
const getOutdentLength = (line: string): number => {
	if (line.startsWith(INDENT_UNIT)) {
		return INDENT_UNIT.length;
	}
	if (line.startsWith("\t") || line.startsWith(" ")) {
		return 1;
	}
	return 0;
};

/**
 * Computes the updated text and selection when Tab or Shift+Tab is pressed in
 * the Markdown editor. Returns `null` if no modification is needed.
 */
export const applyTabIndent = (
	value: string,
	selectionStart: number,
	selectionEnd: number,
	shiftKey: boolean,
): TabIndentResult | null => {
	const hasTrailingNewlineSelection =
		selectionEnd > selectionStart && value[selectionEnd - 1] === "\n";
	const selectedText = value.substring(selectionStart, selectionEnd);
	const isMultiLineSelection = selectedText.includes("\n");

	if (shiftKey) {
		const blockStart = getLineStart(value, selectionStart);
		const effectiveEnd = hasTrailingNewlineSelection
			? selectionEnd - 1
			: selectionEnd;
		const lineEndIndex = value.indexOf("\n", effectiveEnd);
		const blockEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

		const lines = value.substring(blockStart, blockEnd).split("\n");
		let totalRemoved = 0;
		let firstLineRemoved = 0;
		let lastLineRemoved = 0;
		let lastLineStartOrig = blockStart;

		const updatedLines = lines.map((line, index) => {
			if (index > 0) {
				lastLineStartOrig += lines[index - 1].length + 1;
			}
			const removed = getOutdentLength(line);
			if (index === 0) {
				firstLineRemoved = removed;
			}
			lastLineRemoved = removed;
			totalRemoved += removed;
			return removed > 0 ? line.substring(removed) : line;
		});

		if (totalRemoved === 0) {
			return null;
		}

		const newValue =
			value.substring(0, blockStart) +
			updatedLines.join("\n") +
			value.substring(blockEnd);

		const newStart = Math.max(blockStart, selectionStart - firstLineRemoved);
		let newEnd: number;
		if (hasTrailingNewlineSelection) {
			newEnd = Math.max(newStart, selectionEnd - totalRemoved);
		} else {
			const newLastLineStart =
				lastLineStartOrig - (totalRemoved - lastLineRemoved);
			const offsetInLastLine = selectionEnd - lastLineStartOrig;
			newEnd = Math.max(
				newStart,
				newLastLineStart + Math.max(0, offsetInLastLine - lastLineRemoved),
			);
		}

		return {
			value: newValue,
			selectionStart: newStart,
			selectionEnd: newEnd,
		};
	}

	if (isMultiLineSelection) {
		const blockStart = getLineStart(value, selectionStart);
		const effectiveEnd = hasTrailingNewlineSelection
			? selectionEnd - 1
			: selectionEnd;
		const lineEndIndex = value.indexOf("\n", effectiveEnd);
		const blockEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

		const lines = value.substring(blockStart, blockEnd).split("\n");
		const updatedLines = lines.map((line) => `${INDENT_UNIT}${line}`);
		const totalAdded = lines.length * INDENT_UNIT.length;

		const newValue =
			value.substring(0, blockStart) +
			updatedLines.join("\n") +
			value.substring(blockEnd);

		const newStart =
			selectionStart === blockStart
				? blockStart
				: selectionStart + INDENT_UNIT.length;
		const newEnd = selectionEnd + totalAdded;

		return {
			value: newValue,
			selectionStart: newStart,
			selectionEnd: newEnd,
		};
	}

	if (selectionStart === selectionEnd) {
		const lineStart = getLineStart(value, selectionStart);
		const beforeCursor = value.substring(lineStart, selectionStart);

		if (LIST_MARKER_BEFORE_CURSOR_REGEX.test(beforeCursor)) {
			const newValue =
				value.substring(0, lineStart) +
				INDENT_UNIT +
				value.substring(lineStart);
			const nextPos = selectionStart + INDENT_UNIT.length;
			return {
				value: newValue,
				selectionStart: nextPos,
				selectionEnd: nextPos,
			};
		}
	}

	const newValue =
		value.substring(0, selectionStart) +
		INDENT_UNIT +
		value.substring(selectionEnd);
	const nextPos = selectionStart + INDENT_UNIT.length;
	return {
		value: newValue,
		selectionStart: nextPos,
		selectionEnd: nextPos,
	};
};
