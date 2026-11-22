import type { LinkItem } from "../types/task";
import { getSafeUrl } from "./url";

const generateLinkId = (): string =>
	`link-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

/**
 * Normalizes a custom field value of type "link" into a LinkItem array.
 * Supports:
 * - LinkItem[] (current format)
 * - string (legacy single-link format)
 * - string[] (plain URL list)
 */
export const normalizeLinkItems = (
	value: unknown,
	fallbackIdPrefix = "link",
): LinkItem[] => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return [];
		return [{ id: `${fallbackIdPrefix}-0`, url: trimmed }];
	}

	if (!Array.isArray(value)) {
		return [];
	}

	const usedIds = new Set<string>();
	const result: LinkItem[] = [];

	value.forEach((entry, index) => {
		const allocateId = (candidate?: string): string => {
			let base = candidate?.trim() || `${fallbackIdPrefix}-${index}`;
			if (!usedIds.has(base)) {
				usedIds.add(base);
				return base;
			}
			let suffix = 2;
			while (usedIds.has(`${base}-${suffix}`)) {
				suffix += 1;
			}
			base = `${base}-${suffix}`;
			usedIds.add(base);
			return base;
		};

		if (typeof entry === "string") {
			const trimmed = entry.trim();
			if (!trimmed) return;
			result.push({ id: allocateId(), url: trimmed });
			return;
		}

		if (entry && typeof entry === "object") {
			const record = entry as Record<string, unknown>;
			const url = typeof record.url === "string" ? record.url : "";
			const label = typeof record.label === "string" ? record.label : undefined;
			const id = typeof record.id === "string" ? record.id : undefined;

			if (!url.trim() && !label?.trim()) {
				return;
			}

			const item: LinkItem = {
				id: allocateId(id),
				url,
			};
			if (label?.trim()) {
				item.label = label;
			}
			result.push(item);
		}
	});

	return result;
};

/**
 * Returns the display text for a LinkItem, falling back to the raw URL.
 */
export const getLinkDisplayText = (
	item: Pick<LinkItem, "url" | "label">,
): string => {
	const label = item.label?.trim();
	return label || item.url;
};

/**
 * Creates a new normalized LinkItem, or returns null if the URL is empty or invalid.
 */
export const createLinkItem = (
	url: string,
	label?: string,
	id?: string,
): LinkItem | null => {
	const safeUrl = getSafeUrl(url);
	if (!safeUrl) return null;
	const trimmedLabel = label?.trim();
	const item: LinkItem = {
		id: id?.trim() || generateLinkId(),
		url: safeUrl,
	};
	if (trimmedLabel) {
		item.label = trimmedLabel;
	}
	return item;
};
