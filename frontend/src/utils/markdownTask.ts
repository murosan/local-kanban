const TASK_CHECKBOX_REGEX = /^\[([ xX])(\].*)$/;
const NEARBY_LINE_OFFSETS = [-1, 1, -2, 2, -3, 3] as const;

/**
 * Toggles a Markdown task list checkbox (`[ ]` <-> `[x]`) in a single line.
 * Returns the updated line, or `null` if the line is not a task list item.
 */
export const toggleTaskCheckboxInLine = (line: string): string | null => {
	const prefixTokenRegex = />[ \t]*|(?:[-*+]|\d+[.)])[ \t]+/y;
	let pos = 0;

	while (pos < line.length && (line[pos] === " " || line[pos] === "\t")) {
		pos++;
	}

	while (pos < line.length) {
		prefixTokenRegex.lastIndex = pos;
		const tokenMatch = prefixTokenRegex.exec(line);
		if (!tokenMatch) break;
		pos = prefixTokenRegex.lastIndex;
	}

	const checkboxMatch = TASK_CHECKBOX_REGEX.exec(line.slice(pos));
	if (!checkboxMatch) return null;

	const nextMark = checkboxMatch[1] === " " ? "x" : " ";
	return `${line.slice(0, pos)}[${nextMark}${checkboxMatch[2]}`;
};

/**
 * Toggles a Markdown task list checkbox at the given 1-based line number
 * (falling back to nearby lines within +/- 3 lines).
 * Returns the updated markdown string, or `null` if no matching task item was found.
 */
export const toggleTaskCheckboxAtLine = (
	markdown: string,
	lineNum?: number,
): string | null => {
	if (!lineNum || lineNum <= 0) return null;

	const lines = markdown.split("\n");
	const targetIdx = lineNum - 1;
	if (targetIdx < 0 || targetIdx >= lines.length) return null;

	const directUpdated = toggleTaskCheckboxInLine(lines[targetIdx]);
	if (directUpdated !== null) {
		lines[targetIdx] = directUpdated;
		return lines.join("\n");
	}

	for (const offset of NEARBY_LINE_OFFSETS) {
		const idx = targetIdx + offset;
		if (idx >= 0 && idx < lines.length) {
			const nearUpdated = toggleTaskCheckboxInLine(lines[idx]);
			if (nearUpdated !== null) {
				lines[idx] = nearUpdated;
				return lines.join("\n");
			}
		}
	}

	return null;
};
