import { describe, expect, it } from "vitest";
import {
	toggleTaskCheckboxAtLine,
	toggleTaskCheckboxInLine,
} from "./markdownTask";

describe("markdownTask utilities", () => {
	describe("toggleTaskCheckboxInLine", () => {
		it("toggles unordered task list checkboxes", () => {
			expect(toggleTaskCheckboxInLine("- [ ] Buy milk")).toBe("- [x] Buy milk");
			expect(toggleTaskCheckboxInLine("- [x] Buy milk")).toBe("- [ ] Buy milk");
			expect(toggleTaskCheckboxInLine("- [X] Buy milk")).toBe("- [ ] Buy milk");
			expect(toggleTaskCheckboxInLine("* [ ] Star item")).toBe(
				"* [x] Star item",
			);
			expect(toggleTaskCheckboxInLine("+ [x] Plus item")).toBe(
				"+ [ ] Plus item",
			);
			expect(toggleTaskCheckboxInLine("  - [ ] Indented item")).toBe(
				"  - [x] Indented item",
			);
			expect(toggleTaskCheckboxInLine("- [ ]")).toBe("- [x]");
		});

		it("toggles ordered and blockquoted task list checkboxes", () => {
			expect(toggleTaskCheckboxInLine("1. [ ] First task")).toBe(
				"1. [x] First task",
			);
			expect(toggleTaskCheckboxInLine("12) [x] Twelfth task")).toBe(
				"12) [ ] Twelfth task",
			);
			expect(toggleTaskCheckboxInLine("> - [ ] Quoted task")).toBe(
				"> - [x] Quoted task",
			);
			expect(toggleTaskCheckboxInLine(">> - [x] Nested quote")).toBe(
				">> - [ ] Nested quote",
			);
			expect(toggleTaskCheckboxInLine("  > 1. [ ] Quoted ordered task")).toBe(
				"  > 1. [x] Quoted ordered task",
			);
		});

		it("returns null for non-task lines", () => {
			expect(toggleTaskCheckboxInLine("Just a paragraph")).toBeNull();
			expect(toggleTaskCheckboxInLine("- Regular list item")).toBeNull();
			expect(toggleTaskCheckboxInLine("- [a] Invalid checkbox")).toBeNull();
			expect(toggleTaskCheckboxInLine("Text with [ ] inline")).toBeNull();
		});

		it("handles long repetitive inputs in linear time without backtracking", () => {
			const manyDigits = `${"9".repeat(50_000)}!`;
			const manyQuotes = `${"> ".repeat(20_000)}not a task`;
			const start = performance.now();
			expect(toggleTaskCheckboxInLine(manyDigits)).toBeNull();
			expect(toggleTaskCheckboxInLine(manyQuotes)).toBeNull();
			expect(performance.now() - start).toBeLessThan(200);
		});
	});

	describe("toggleTaskCheckboxAtLine", () => {
		it("toggles the task at the exact 1-based line number", () => {
			const md = ["# Title", "- [ ] Task 1", "- [x] Task 2"].join("\n");
			expect(toggleTaskCheckboxAtLine(md, 2)).toBe(
				["# Title", "- [x] Task 1", "- [x] Task 2"].join("\n"),
			);
			expect(toggleTaskCheckboxAtLine(md, 3)).toBe(
				["# Title", "- [ ] Task 1", "- [ ] Task 2"].join("\n"),
			);
		});

		it("falls back to nearby task lines within +/- 3 lines", () => {
			const md = ["Paragraph", "", "- [ ] Nearby task"].join("\n");
			expect(toggleTaskCheckboxAtLine(md, 1)).toBe(
				["Paragraph", "", "- [x] Nearby task"].join("\n"),
			);
		});

		it("returns null when lineNum is invalid or no task exists nearby", () => {
			expect(toggleTaskCheckboxAtLine("- [ ] Task", undefined)).toBeNull();
			expect(toggleTaskCheckboxAtLine("- [ ] Task", 0)).toBeNull();
			expect(toggleTaskCheckboxAtLine("- [ ] Task", 5)).toBeNull();
			expect(toggleTaskCheckboxAtLine("No tasks here", 1)).toBeNull();
		});
	});
});
