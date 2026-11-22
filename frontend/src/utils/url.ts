const DANGEROUS_SCHEME_RE = /^(javascript|data|vbscript):/i;
const SCHEME_PREFIX_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD_RE = /^(?:[a-z]{2,}|xn--[a-z0-9]{2,})$/i;
const MAILTO_RE = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+(?:\?[^\s]*)?$/i;
const TEL_RE = /^tel:[+\d][\d\s().-]+$/i;

const extractRawHost = (authorityUrl: string): string => {
	const afterSlashes = authorityUrl.slice(authorityUrl.indexOf("://") + 3);
	const authority = afterSlashes.split(/[/?#]/, 1)[0] ?? "";
	const withoutUserInfo = authority.includes("@")
		? authority.slice(authority.lastIndexOf("@") + 1)
		: authority;
	if (withoutUserInfo.startsWith("[")) {
		const closingIdx = withoutUserInfo.indexOf("]");
		return closingIdx === -1
			? withoutUserInfo
			: withoutUserInfo.slice(0, closingIdx + 1);
	}
	return withoutUserInfo.split(":", 1)[0] ?? "";
};

const isValidHttpHostname = (
	parsedHostname: string,
	rawHost: string,
): boolean => {
	if (!parsedHostname || !rawHost) return false;
	if (parsedHostname === "localhost") return true;
	if (parsedHostname.startsWith("[") && parsedHostname.endsWith("]")) {
		return true;
	}
	if (IPV4_RE.test(parsedHostname)) {
		// Reject shorthand numeric hosts like "123.456" or "12345" that URL coerces to IPv4
		return IPV4_RE.test(rawHost);
	}
	if (!parsedHostname.includes(".")) return false;
	const labels = parsedHostname.split(".");
	if (labels.some((label) => !DOMAIN_LABEL_RE.test(label))) {
		return false;
	}
	const tld = labels[labels.length - 1];
	return TLD_RE.test(tld);
};

const isValidHttpUrl = (candidate: string): boolean => {
	if (/\s/.test(candidate)) return false;
	if (!/^https?:\/\//i.test(candidate)) return false;
	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return false;
		}
		const rawHost = extractRawHost(candidate);
		return isValidHttpHostname(parsed.hostname, rawHost);
	} catch {
		return false;
	}
};

/**
 * Validates and normalizes a URL string.
 *
 * Rules:
 * 1. Blocks dangerous schemes (javascript:, data:, vbscript:).
 * 2. Validates http(s) URLs strictly (valid domain, localhost, IPv4, or IPv6).
 * 3. Accepts valid custom URI schemes (e.g., vscode://..., slack://..., obsidian://..., mailto:..., tel:...).
 * 4. Prepends 'https://' to valid scheme-less domains/paths (e.g., example.com -> https://example.com)
 *    and rejects plain text or malformed strings.
 */
export const getSafeUrl = (url: unknown): string | null => {
	if (typeof url !== "string") return null;
	const trimmed = url.trim();
	if (!trimmed) return null;

	// Block dangerous schemes
	if (DANGEROUS_SCHEME_RE.test(trimmed)) {
		return null;
	}

	const schemeMatch = SCHEME_PREFIX_RE.exec(trimmed);
	if (schemeMatch) {
		const scheme = schemeMatch[1].toLowerCase();

		if (scheme === "http" || scheme === "https") {
			return isValidHttpUrl(trimmed) ? trimmed : null;
		}

		if (scheme === "mailto") {
			return MAILTO_RE.test(trimmed) ? trimmed : null;
		}

		if (scheme === "tel") {
			return TEL_RE.test(trimmed) ? trimmed : null;
		}

		// Custom URI schemes must use "scheme://<target>" with a non-empty target
		const schemePrefix = `${schemeMatch[1]}://`;
		if (!trimmed.startsWith(schemePrefix)) {
			return null;
		}
		const remainder = trimmed.slice(schemePrefix.length).trim();
		if (!remainder) {
			return null;
		}
		try {
			new URL(trimmed);
			return trimmed;
		} catch {
			return null;
		}
	}

	// Scheme-less input: disallow whitespace and leading slashes/colons, validate as https://
	if (/\s/.test(trimmed) || /^[:/]/.test(trimmed)) {
		return null;
	}
	const withHttps = `https://${trimmed}`;
	return isValidHttpUrl(withHttps) ? withHttps : null;
};

export const isValidUrl = (url: unknown): boolean => getSafeUrl(url) !== null;
