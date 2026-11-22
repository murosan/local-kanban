import { describe, expect, it } from "vitest";
import { getSafeUrl, isValidUrl } from "./url";

describe("getSafeUrl", () => {
	it("returns null for non-string or empty input", () => {
		expect(getSafeUrl(null)).toBeNull();
		expect(getSafeUrl(undefined)).toBeNull();
		expect(getSafeUrl(123)).toBeNull();
		expect(getSafeUrl("")).toBeNull();
		expect(getSafeUrl("   ")).toBeNull();
	});

	it("blocks dangerous schemes", () => {
		expect(getSafeUrl("javascript:alert(1)")).toBeNull();
		expect(getSafeUrl("JAVASCRIPT:alert(1)")).toBeNull();
		expect(getSafeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
		expect(getSafeUrl('vbscript:msgbox("hello")')).toBeNull();
	});

	it("accepts standard web URLs", () => {
		expect(getSafeUrl("http://example.com")).toBe("http://example.com");
		expect(getSafeUrl("https://example.com/path?query=1")).toBe(
			"https://example.com/path?query=1",
		);
		expect(getSafeUrl("http://localhost:3737/api/tasks")).toBe(
			"http://localhost:3737/api/tasks",
		);
		expect(getSafeUrl("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
		expect(getSafeUrl("http://[::1]:3737")).toBe("http://[::1]:3737");
		expect(getSafeUrl("https://ja.wikipedia.org/wiki/日本語")).toBe(
			"https://ja.wikipedia.org/wiki/日本語",
		);
	});

	it("accepts custom URI schemes like vscode:// or slack://", () => {
		expect(getSafeUrl("vscode://file/Users/test/project")).toBe(
			"vscode://file/Users/test/project",
		);
		expect(
			getSafeUrl(
				"vscode://file/Users/masashi/workspace/life/01_街散策ロケハン計画.md",
			),
		).toBe(
			"vscode://file/Users/masashi/workspace/life/01_街散策ロケハン計画.md",
		);
		expect(getSafeUrl("slack://channel?team=T123&id=C123")).toBe(
			"slack://channel?team=T123&id=C123",
		);
		expect(getSafeUrl("mailto:user@example.com")).toBe(
			"mailto:user@example.com",
		);
		expect(getSafeUrl("obsidian://open?vault=my%20vault")).toBe(
			"obsidian://open?vault=my%20vault",
		);
	});

	it("prepends https:// when scheme is missing for valid domains", () => {
		expect(getSafeUrl("example.com")).toBe("https://example.com");
		expect(getSafeUrl("github.com/murosan/local-kanban")).toBe(
			"https://github.com/murosan/local-kanban",
		);
	});

	it("rejects plain text and malformed URLs", () => {
		expect(getSafeUrl("invalid")).toBeNull();
		expect(getSafeUrl("テスト")).toBeNull();
		expect(getSafeUrl("hello world")).toBeNull();
		expect(getSafeUrl("foo/bar")).toBeNull();
		expect(getSafeUrl("a.b")).toBeNull();
		expect(getSafeUrl("123.456")).toBeNull();
		expect(getSafeUrl("12345")).toBeNull();
		expect(getSafeUrl("http://")).toBeNull();
		expect(getSafeUrl("https://")).toBeNull();
		expect(getSafeUrl("https://invalid")).toBeNull();
		expect(getSafeUrl("http:example.com")).toBeNull();
		expect(getSafeUrl("https://exa mple.com")).toBeNull();
		expect(getSafeUrl("https://example.com/path with space")).toBeNull();
		expect(getSafeUrl("https://..example.com")).toBeNull();
		expect(getSafeUrl("https://example..com")).toBeNull();
		expect(getSafeUrl("vscode://")).toBeNull();
		expect(getSafeUrl("foo:bar")).toBeNull();
		expect(getSafeUrl("://example.com")).toBeNull();
		expect(getSafeUrl("mailto:")).toBeNull();
		expect(getSafeUrl("mailto:not-an-email")).toBeNull();
	});
});

describe("isValidUrl", () => {
	it("returns true for valid URLs and false for invalid ones", () => {
		expect(isValidUrl("https://example.com")).toBe(true);
		expect(isValidUrl("vscode://file/test.md")).toBe(true);
		expect(isValidUrl("example.com")).toBe(true);
		expect(isValidUrl("not a url")).toBe(false);
		expect(isValidUrl("javascript:alert(1)")).toBe(false);
	});
});
