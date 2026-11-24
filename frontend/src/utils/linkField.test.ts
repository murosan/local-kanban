import { describe, expect, it } from "vitest";
import type { LinkItem } from "../types/task";
import {
	createLinkItem,
	getLinkDisplayText,
	normalizeLinkItems,
} from "./linkField";
import { moveItemByOffset, reorderItemsById } from "./reorder";

describe("normalizeLinkItems", () => {
	it("returns empty array for nullish, boolean, number, or empty string values", () => {
		expect(normalizeLinkItems(null)).toEqual([]);
		expect(normalizeLinkItems(undefined)).toEqual([]);
		expect(normalizeLinkItems("")).toEqual([]);
		expect(normalizeLinkItems("   ")).toEqual([]);
		expect(normalizeLinkItems(false)).toEqual([]);
		expect(normalizeLinkItems(42)).toEqual([]);
	});

	it("migrates a legacy single string URL into a single-element list", () => {
		expect(normalizeLinkItems("https://example.com/spec", "cf1")).toEqual([
			{ id: "cf1-0", url: "https://example.com/spec" },
		]);
		expect(
			normalizeLinkItems("  vscode://file/Users/test/doc.md  ", "cf1"),
		).toEqual([{ id: "cf1-0", url: "vscode://file/Users/test/doc.md" }]);
	});

	it("normalizes an array of plain strings", () => {
		expect(
			normalizeLinkItems(
				["https://a.example.com", "  ", "https://b.example.com"],
				"cf2",
			),
		).toEqual([
			{ id: "cf2-0", url: "https://a.example.com" },
			{ id: "cf2-2", url: "https://b.example.com" },
		]);
	});

	it("preserves LinkItem objects with optional labels and deduplicates IDs", () => {
		expect(
			normalizeLinkItems(
				[
					{ id: "l1", url: "https://example.com/spec", label: "仕様書" },
					{ id: "l1", url: "https://example.com/pr", label: "   " },
					{ url: "vscode://file/README.md" },
					{ id: "empty", url: "  ", label: "" },
				],
				"cf3",
			),
		).toEqual([
			{ id: "l1", url: "https://example.com/spec", label: "仕様書" },
			{ id: "l1-2", url: "https://example.com/pr" },
			{ id: "cf3-2", url: "vscode://file/README.md" },
		]);
	});

	it("returns original reference when items are already normalized with unique IDs", () => {
		const items: LinkItem[] = [
			{ id: "l1", url: "https://example.com/spec", label: "仕様書" },
			{ id: "l2", url: "https://example.com/pr" },
		];
		expect(normalizeLinkItems(items, "cf4")).toBe(items);
	});
});

describe("reordering link items", () => {
	const items: LinkItem[] = [
		{ id: "link-1", url: "https://example.com/spec", label: "仕様書" },
		{ id: "link-2", url: "https://example.com/pr" },
		{ id: "link-3", url: "vscode://file/README.md", label: "README" },
	];

	it("reorders link items by drag ID while preserving url and label", () => {
		const reordered = reorderItemsById(items, "link-1", "link-3");
		expect(reordered).toEqual([
			{ id: "link-2", url: "https://example.com/pr" },
			{ id: "link-3", url: "vscode://file/README.md", label: "README" },
			{ id: "link-1", url: "https://example.com/spec", label: "仕様書" },
		]);
	});

	it("moves link items by offset while preserving url and label", () => {
		const movedUp = moveItemByOffset(items, 2, -1);
		expect(movedUp.map((i) => i.id)).toEqual(["link-1", "link-3", "link-2"]);
		expect(movedUp[1]).toEqual({
			id: "link-3",
			url: "vscode://file/README.md",
			label: "README",
		});

		const movedDown = moveItemByOffset(items, 0, 1);
		expect(movedDown.map((i) => i.id)).toEqual(["link-2", "link-1", "link-3"]);
	});
});

describe("getLinkDisplayText", () => {
	it("returns trimmed label when provided", () => {
		expect(
			getLinkDisplayText({ url: "https://example.com", label: " 仕様書 " }),
		).toBe("仕様書");
	});

	it("falls back to url when label is missing or blank", () => {
		expect(getLinkDisplayText({ url: "https://example.com" })).toBe(
			"https://example.com",
		);
		expect(
			getLinkDisplayText({ url: "https://example.com", label: "   " }),
		).toBe("https://example.com");
	});
});

describe("createLinkItem", () => {
	it("returns null when URL is blank or invalid", () => {
		expect(createLinkItem("")).toBeNull();
		expect(createLinkItem("   ", "ラベル")).toBeNull();
		expect(createLinkItem("not-a-url", "ラベル")).toBeNull();
		expect(createLinkItem("javascript:alert(1)", "XSS")).toBeNull();
		expect(createLinkItem("https://")).toBeNull();
	});

	it("creates item with normalized url and optional trimmed label", () => {
		expect(
			createLinkItem(" https://example.com ", " 設計書 ", "link-1"),
		).toEqual({
			id: "link-1",
			url: "https://example.com",
			label: "設計書",
		});
		expect(createLinkItem("example.com", "  ", "link-2")).toEqual({
			id: "link-2",
			url: "https://example.com",
		});
		expect(
			createLinkItem("vscode://file/Users/test/a.md", "エディタ", "link-3"),
		).toEqual({
			id: "link-3",
			url: "vscode://file/Users/test/a.md",
			label: "エディタ",
		});
	});
});
