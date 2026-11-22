const timers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();
let lastAnnouncement = "";
let listenerInitialized = false;

const legacyCopy = (text: string): boolean => {
	const field = Object.assign(document.createElement("textarea"), {
		value: text,
	});
	field.setAttribute("readonly", "");
	field.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
	document.body.append(field);
	field.select();
	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		field.remove();
	}
};

export const reportCopyResult = (
	button: HTMLButtonElement,
	ok: boolean,
): void => {
	const tip = button.nextElementSibling;
	const existingTimer = timers.get(button);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	button.removeAttribute("data-copied");
	button.removeAttribute("data-failed");

	let message = ok
		? button.dataset.copiedMessage || "Copied"
		: button.dataset.failedMessage || "Copy failed";
	if (message === lastAnnouncement) {
		message += "\u00A0";
	}
	lastAnnouncement = message;

	if (tip instanceof HTMLElement) {
		tip.textContent = "";
	}
	void button.offsetWidth;
	button.setAttribute(ok ? "data-copied" : "data-failed", "");

	requestAnimationFrame(() => {
		if (tip instanceof HTMLElement) {
			tip.textContent = message;
		}
	});

	timers.set(
		button,
		setTimeout(() => {
			button.removeAttribute("data-copied");
			button.removeAttribute("data-failed");
			if (tip instanceof HTMLElement) {
				tip.textContent = "";
			}
		}, 2000),
	);
};

export interface CopyTargetLike {
	dataset: { copyText?: string };
	matches: (selector: string) => boolean;
	innerText: string;
	value?: string;
}

export const extractCopyText = (target: CopyTargetLike): string => {
	if (target.dataset.copyText !== undefined) {
		return target.dataset.copyText.trim();
	}
	if (target.matches("input, textarea")) {
		return target.value ?? "";
	}
	// biome-ignore lint/performance/useDomNodeTextContent: innerText preserves rendered line breaks for copied prose/code
	return target.innerText.trim();
};

export const copyFromTarget = async (
	button: HTMLButtonElement,
	target: HTMLElement,
): Promise<void> => {
	const text = extractCopyText(target);
	if (!text) return;

	try {
		if (!navigator.clipboard?.writeText) {
			if (!legacyCopy(text)) {
				throw new Error("Copy failed");
			}
		} else {
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				if (!legacyCopy(text)) {
					throw new Error("Copy failed");
				}
			}
		}
		reportCopyResult(button, true);
	} catch {
		reportCopyResult(button, false);
	}
};

export const initCopyCommandListener = (): void => {
	if (
		listenerInitialized ||
		typeof window === "undefined" ||
		typeof document === "undefined"
	) {
		return;
	}
	listenerInitialized = true;

	if ("CommandEvent" in window) {
		document.addEventListener(
			"command",
			(event) => {
				const cmdEvent = event as Event & {
					command?: string;
					source?: HTMLElement | null;
				};
				if (
					cmdEvent.command?.startsWith("--copy") &&
					cmdEvent.source instanceof HTMLButtonElement &&
					cmdEvent.target instanceof HTMLElement
				) {
					void copyFromTarget(cmdEvent.source, cmdEvent.target);
				}
			},
			true,
		);
	} else {
		document.addEventListener(
			"click",
			(event) => {
				const eventTarget = event.target;
				if (!(eventTarget instanceof Element)) return;
				const button = eventTarget.closest('button[command^="--copy"]');
				if (!(button instanceof HTMLButtonElement)) return;
				const targetId = button.getAttribute("commandfor");
				if (!targetId) return;
				const target = document.getElementById(targetId);
				if (target) {
					void copyFromTarget(button, target);
				}
			},
			true,
		);
	}
};
