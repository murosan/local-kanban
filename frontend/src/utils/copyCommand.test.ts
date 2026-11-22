import { describe, expect, it } from "vitest";
import { extractCopyText } from "./copyCommand";

describe("extractCopyText", () => {
	it("prefers data-copy-text over visible innerText so links copy URL instead of label", () => {
		const anchorMock = {
			dataset: { copyText: " https://example.com/spec " },
			matches: () => false,
			innerText: "仕様書",
		};
		expect(extractCopyText(anchorMock)).toBe("https://example.com/spec");
	});

	it("reads value from input or textarea elements", () => {
		const inputMock = {
			dataset: {},
			matches: (selector: string) => selector === "input, textarea",
			innerText: "",
			value: "vscode://file/Users/test/project",
		};
		expect(extractCopyText(inputMock)).toBe("vscode://file/Users/test/project");
	});

	it("falls back to trimmed innerText for regular elements", () => {
		const spanMock = {
			dataset: {},
			matches: () => false,
			innerText: "  hello world  ",
		};
		expect(extractCopyText(spanMock)).toBe("hello world");
	});
});
