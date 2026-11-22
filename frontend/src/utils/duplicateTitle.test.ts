import { describe, expect, it } from "vitest";
import { buildDuplicateTitle } from "./duplicateTitle";

describe("buildDuplicateTitle", () => {
	it("appends Japanese copy suffix on first duplication", () => {
		expect(buildDuplicateTitle("認証ロジック実装", "コピー")).toBe(
			"認証ロジック実装 (コピー)",
		);
	});

	it("increments suffix number when duplicating an already duplicated Japanese title", () => {
		expect(buildDuplicateTitle("認証ロジック実装 (コピー)", "コピー")).toBe(
			"認証ロジック実装 (コピー 2)",
		);
		expect(buildDuplicateTitle("認証ロジック実装 (コピー 2)", "コピー")).toBe(
			"認証ロジック実装 (コピー 3)",
		);
	});

	it("appends and increments English Copy suffix", () => {
		expect(buildDuplicateTitle("Implement auth", "Copy")).toBe(
			"Implement auth (Copy)",
		);
		expect(buildDuplicateTitle("Implement auth (Copy)", "Copy")).toBe(
			"Implement auth (Copy 2)",
		);
		expect(buildDuplicateTitle("Implement auth (Copy 9)", "Copy")).toBe(
			"Implement auth (Copy 10)",
		);
	});

	it("trims surrounding whitespace and handles empty titles safely", () => {
		expect(buildDuplicateTitle("  My Task  ", "Copy")).toBe("My Task (Copy)");
		expect(buildDuplicateTitle("   ", "コピー")).toBe("コピー");
	});
});
