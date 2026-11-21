import { describe, expect, it } from "vitest";
import { applyTabIndent } from "./markdownIndent";

describe("applyTabIndent", () => {
	describe("Tab right after list markers", () => {
		it("indents unordered list markers (-, *, +) when cursor is immediately after marker", () => {
			expect(applyTabIndent("- ", 2, 2, false)).toEqual({
				value: "  - ",
				selectionStart: 4,
				selectionEnd: 4,
			});

			expect(applyTabIndent("* ", 2, 2, false)).toEqual({
				value: "  * ",
				selectionStart: 4,
				selectionEnd: 4,
			});

			expect(applyTabIndent("+ ", 2, 2, false)).toEqual({
				value: "  + ",
				selectionStart: 4,
				selectionEnd: 4,
			});
		});

		it("indents further when already indented", () => {
			expect(applyTabIndent("- parent\n  - ", 13, 13, false)).toEqual({
				value: "- parent\n    - ",
				selectionStart: 15,
				selectionEnd: 15,
			});
		});

		it("indents line while keeping trailing item text when cursor is right after list marker", () => {
			expect(applyTabIndent("- parent\n- child", 11, 11, false)).toEqual({
				value: "- parent\n  - child",
				selectionStart: 13,
				selectionEnd: 13,
			});
		});

		it("indents ordered list markers (1. , 10. , 1) )", () => {
			expect(applyTabIndent("1. ", 3, 3, false)).toEqual({
				value: "  1. ",
				selectionStart: 5,
				selectionEnd: 5,
			});

			expect(applyTabIndent("1. first\n10. second", 13, 13, false)).toEqual({
				value: "1. first\n  10. second",
				selectionStart: 15,
				selectionEnd: 15,
			});

			expect(applyTabIndent("1) ", 3, 3, false)).toEqual({
				value: "  1) ",
				selectionStart: 5,
				selectionEnd: 5,
			});
		});

		it("indents task list / checklist markers", () => {
			expect(applyTabIndent("- [ ] ", 6, 6, false)).toEqual({
				value: "  - [ ] ",
				selectionStart: 8,
				selectionEnd: 8,
			});

			expect(applyTabIndent("  - [x] task", 8, 8, false)).toEqual({
				value: "    - [x] task",
				selectionStart: 10,
				selectionEnd: 10,
			});

			expect(applyTabIndent("* [X]", 5, 5, false)).toEqual({
				value: "  * [X]",
				selectionStart: 7,
				selectionEnd: 7,
			});
		});
	});

	describe("Tab in non-marker positions", () => {
		it("inserts two spaces at cursor when cursor is after item text", () => {
			expect(applyTabIndent("- item", 6, 6, false)).toEqual({
				value: "- item  ",
				selectionStart: 8,
				selectionEnd: 8,
			});
		});

		it("inserts two spaces at cursor on normal text lines", () => {
			expect(applyTabIndent("hello world", 5, 5, false)).toEqual({
				value: "hello   world",
				selectionStart: 7,
				selectionEnd: 7,
			});
		});

		it("replaces single-line non-empty selection with two spaces", () => {
			expect(applyTabIndent("hello world", 6, 11, false)).toEqual({
				value: "hello   ",
				selectionStart: 8,
				selectionEnd: 8,
			});
		});
	});

	describe("Shift+Tab (outdent)", () => {
		it("outdents bullet, ordered, and task list items when cursor is right after marker", () => {
			expect(applyTabIndent("- parent\n  - ", 13, 13, true)).toEqual({
				value: "- parent\n- ",
				selectionStart: 11,
				selectionEnd: 11,
			});

			expect(applyTabIndent("    - child", 6, 6, true)).toEqual({
				value: "  - child",
				selectionStart: 4,
				selectionEnd: 4,
			});

			expect(applyTabIndent("  1. ", 5, 5, true)).toEqual({
				value: "1. ",
				selectionStart: 3,
				selectionEnd: 3,
			});

			expect(applyTabIndent("  - [ ] ", 8, 8, true)).toEqual({
				value: "- [ ] ",
				selectionStart: 6,
				selectionEnd: 6,
			});
		});

		it("returns null when line has no leading indentation", () => {
			expect(applyTabIndent("- ", 2, 2, true)).toBeNull();
			expect(applyTabIndent("- parent\n- ", 11, 11, true)).toBeNull();
		});

		it("handles single space and tab character indentation", () => {
			expect(applyTabIndent(" - item", 3, 3, true)).toEqual({
				value: "- item",
				selectionStart: 2,
				selectionEnd: 2,
			});

			expect(applyTabIndent("\t- item", 3, 3, true)).toEqual({
				value: "- item",
				selectionStart: 2,
				selectionEnd: 2,
			});
		});

		it("clamps cursor to line start when cursor is inside removed indentation", () => {
			expect(applyTabIndent("- parent\n  - item", 10, 10, true)).toEqual({
				value: "- parent\n- item",
				selectionStart: 9,
				selectionEnd: 9,
			});
		});

		it("handles leading newline when cursor is at position 0", () => {
			expect(applyTabIndent("\n  - item", 0, 0, true)).toBeNull();
		});
	});

	describe("Multi-line selection Tab / Shift+Tab", () => {
		it("indents all selected lines on Tab", () => {
			const text = "- parent\n- child 1\n- child 2";
			expect(applyTabIndent(text, 9, 28, false)).toEqual({
				value: "- parent\n  - child 1\n  - child 2",
				selectionStart: 9,
				selectionEnd: 32,
			});
		});

		it("does not indent next line when selection ends right after a trailing newline", () => {
			const text = "- a\n- b\n- c";
			expect(applyTabIndent(text, 0, 8, false)).toEqual({
				value: "  - a\n  - b\n- c",
				selectionStart: 0,
				selectionEnd: 12,
			});
		});

		it("outdents all selected lines on Shift+Tab and preserves selection bounds", () => {
			const text = "- parent\n  - child 1\n  - child 2";
			expect(applyTabIndent(text, 9, 32, true)).toEqual({
				value: "- parent\n- child 1\n- child 2",
				selectionStart: 9,
				selectionEnd: 28,
			});
		});

		it("handles mixed indented and unindented lines on multi-line Shift+Tab", () => {
			const text = "- aaa\n  - bbb";
			expect(applyTabIndent(text, 2, 11, true)).toEqual({
				value: "- aaa\n- bbb",
				selectionStart: 2,
				selectionEnd: 9,
			});
		});

		it("does not leak selectionEnd into previous line when selectionEnd is inside leading indent", () => {
			const text = "  - aaa\n  - bbb";
			expect(applyTabIndent(text, 2, 9, true)).toEqual({
				value: "- aaa\n- bbb",
				selectionStart: 0,
				selectionEnd: 6,
			});
		});
	});
});
