import { describe, expect, it } from "vitest";
import type { CustomFieldType } from "../types/task";
import { getCustomFieldTypeKey, translations } from "./translations";

const extractPlaceholders = (text: string): string[] => {
	const matches = text.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
	return [...new Set(matches)].sort();
};

describe("translations", () => {
	it("has identical translation keys between ja and en", () => {
		const jaKeys = Object.keys(translations.ja).sort();
		const enKeys = Object.keys(translations.en).sort();
		expect(enKeys).toEqual(jaKeys);
	});

	it("has non-empty values and matching placeholders across ja and en", () => {
		for (const key of Object.keys(translations.ja) as Array<
			keyof typeof translations.ja
		>) {
			const jaText = translations.ja[key];
			const enText = translations.en[key];
			expect(
				jaText.trim().length,
				`ja[${key}] should not be empty`,
			).toBeGreaterThan(0);
			expect(
				enText.trim().length,
				`en[${key}] should not be empty`,
			).toBeGreaterThan(0);
			expect(
				extractPlaceholders(enText),
				`placeholders for ${key} should match`,
			).toEqual(extractPlaceholders(jaText));
		}
	});

	it("maps every CustomFieldType to a valid translation key", () => {
		const fieldTypes: CustomFieldType[] = [
			"dropdown",
			"text",
			"number",
			"date",
			"checkbox",
			"link",
			"checklist",
		];
		for (const fieldType of fieldTypes) {
			const key = getCustomFieldTypeKey(fieldType);
			expect(key in translations.ja).toBe(true);
			expect(key in translations.en).toBe(true);
		}
	});
});
