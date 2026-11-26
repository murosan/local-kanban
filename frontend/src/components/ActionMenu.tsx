import type React from "react";
import {
	Fragment,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

export interface ActionMenuItem {
	id: string;
	label: string;
	icon?: React.ReactNode;
	onSelect: () => void | Promise<void>;
	disabled?: boolean;
	variant?: "default" | "danger";
	checked?: boolean;
}

export interface ActionMenuGroup {
	id: string;
	items: ActionMenuItem[];
}

interface ActionMenuProps {
	triggerLabel: string;
	triggerIcon: React.ReactNode;
	groups: ActionMenuGroup[];
	onOpenChange?: (isOpen: boolean) => void;
	triggerClassName?: string;
	popoverClassName?: string;
}

type FocusOptionsWithVisible = FocusOptions & { focusVisible?: boolean };

const focusElement = (
	el: HTMLElement | null | undefined,
	{ focusVisible }: { focusVisible?: boolean } = {},
) => {
	if (!el) return;
	const options: FocusOptionsWithVisible = { preventScroll: true };
	if (focusVisible !== undefined) {
		options.focusVisible = focusVisible;
	}
	try {
		el.focus(options);
	} catch {
		el.focus({ preventScroll: true });
	}
};

const supportsNativePopover = (): boolean =>
	typeof HTMLElement !== "undefined" &&
	Object.getOwnPropertyDescriptor(HTMLElement.prototype, "popover") !==
		undefined;

const supportsInvokerCommands = (): boolean =>
	typeof HTMLButtonElement !== "undefined" &&
	"commandForElement" in HTMLButtonElement.prototype;

const supportsNativeFocusgroup = (): boolean =>
	typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;

const supportsCssAnchorPositioning = (): boolean =>
	typeof CSS !== "undefined" &&
	typeof CSS.supports === "function" &&
	CSS.supports("position-area", "block-end");

export const ActionMenu: React.FC<ActionMenuProps> = ({
	triggerLabel,
	triggerIcon,
	groups,
	onOpenChange,
	triggerClassName = "",
	popoverClassName = "",
}) => {
	const baseId = useId();
	const triggerId = `${baseId}-trigger`;
	const menuId = `${baseId}-menu`;

	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const groupRef = useRef<HTMLDivElement>(null);

	const [isOpen, setIsOpen] = useState(false);
	const isOpenRef = useRef(false);
	const enterOnOpenRef = useRef(false);
	const pointerTriggerRef = useRef(false);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearPendingClose = useCallback(() => {
		if (closeTimerRef.current !== null) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		return () => {
			clearPendingClose();
		};
	}, [clearPendingClose]);

	const visibleGroups = groups.filter((group) => group.items.length > 0);
	const visibleItemCount = visibleGroups.reduce(
		(sum, group) => sum + group.items.length,
		0,
	);

	const getEnabledItems = useCallback((): HTMLButtonElement[] => {
		const groupEl = groupRef.current;
		if (!groupEl) return [];
		return Array.from(
			groupEl.querySelectorAll<HTMLButtonElement>("button"),
		).filter(
			(item) => !item.disabled && item.getAttribute("aria-disabled") !== "true",
		);
	}, []);

	const positionFallback = useCallback(() => {
		if (supportsCssAnchorPositioning()) return;
		const trigger = triggerRef.current;
		const popover = popoverRef.current;
		if (!trigger || !popover) return;

		const triggerRect = trigger.getBoundingClientRect();
		const popoverRect = popover.getBoundingClientRect();
		const gap = 6;
		const margin = 8;

		// Right-align below trigger, flipping above or clamping to viewport on overflow
		let left = triggerRect.right - popoverRect.width;
		if (left < margin) {
			left = Math.max(margin, triggerRect.left);
		}
		if (left + popoverRect.width > window.innerWidth - margin) {
			left = Math.max(margin, window.innerWidth - popoverRect.width - margin);
		}

		let top = triggerRect.bottom + gap;
		if (top + popoverRect.height > window.innerHeight - margin) {
			const aboveTop = triggerRect.top - popoverRect.height - gap;
			if (aboveTop >= margin) {
				top = aboveTop;
			} else {
				top = Math.max(
					margin,
					window.innerHeight - popoverRect.height - margin,
				);
			}
		}

		popover.style.left = `${Math.round(left)}px`;
		popover.style.top = `${Math.round(top)}px`;
	}, []);

	const syncOpenState = useCallback(
		(nextOpen: boolean) => {
			isOpenRef.current = nextOpen;
			setIsOpen(nextOpen);
			onOpenChange?.(nextOpen);
		},
		[onOpenChange],
	);

	const hideMenu = useCallback(
		({
			restoreFocus,
			fromPointer,
		}: {
			restoreFocus: boolean;
			fromPointer?: boolean;
		}) => {
			clearPendingClose();
			const popover = popoverRef.current;
			const trigger = triggerRef.current;

			if (restoreFocus) {
				focusElement(trigger, { focusVisible: !fromPointer });
			}

			if (supportsNativePopover() && popover) {
				try {
					if (popover.matches(":popover-open")) {
						popover.hidePopover();
					}
				} catch {
					syncOpenState(false);
				}
			} else {
				syncOpenState(false);
			}
		},
		[clearPendingClose, syncOpenState],
	);

	const showMenu = useCallback(() => {
		const popover = popoverRef.current;
		const trigger = triggerRef.current;
		if (!popover || !trigger) return;

		if (supportsNativePopover()) {
			try {
				(
					popover as HTMLElement & {
						showPopover: (options?: { source?: HTMLElement }) => void;
					}
				).showPopover({ source: trigger });
			} catch {
				popover.showPopover();
			}
		} else {
			syncOpenState(true);
			requestAnimationFrame(() => {
				positionFallback();
				if (enterOnOpenRef.current) {
					enterOnOpenRef.current = false;
					focusElement(getEnabledItems()[0]);
				} else {
					focusElement(trigger, { focusVisible: false });
				}
			});
		}
	}, [getEnabledItems, positionFallback, syncOpenState]);

	// Handle native Popover toggle event (keeps aria-expanded in sync and moves focus on open)
	useEffect(() => {
		const popover = popoverRef.current;
		if (!popover || !supportsNativePopover()) return;

		const handleToggle = (event: Event) => {
			const toggleEvent = event as ToggleEvent;
			const nextOpen = toggleEvent.newState === "open";
			syncOpenState(nextOpen);

			if (nextOpen) {
				positionFallback();
				if (enterOnOpenRef.current) {
					enterOnOpenRef.current = false;
					focusElement(getEnabledItems()[0]);
				} else {
					focusElement(triggerRef.current, { focusVisible: false });
				}
			} else {
				clearPendingClose();
				enterOnOpenRef.current = false;
			}
		};

		popover.addEventListener("toggle", handleToggle);
		return () => {
			popover.removeEventListener("toggle", handleToggle);
		};
	}, [clearPendingClose, getEnabledItems, positionFallback, syncOpenState]);

	// Fallback for browsers without native focusgroup:
	// Set role="menu" / role="menuitem" and install ArrowDown/ArrowUp/Home/End wrap-around navigation.
	// When native focusgroup IS present, only handle Home/End (and never add explicit menu roles).
	useEffect(() => {
		const groupEl = groupRef.current;
		if (!groupEl || visibleItemCount === 0) return;

		const hasNativeFocusgroup = supportsNativeFocusgroup();
		if (!hasNativeFocusgroup) {
			groupEl.setAttribute("role", "menu");
			for (const item of groupEl.querySelectorAll("button:not([role])")) {
				item.setAttribute("role", "menuitem");
			}
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				hideMenu({ restoreFocus: true, fromPointer: false });
				return;
			}

			if (event.key === "Tab") {
				hideMenu({ restoreFocus: false });
				return;
			}

			const handledKeys = hasNativeFocusgroup
				? ["Home", "End"]
				: ["ArrowDown", "ArrowUp", "Home", "End"];
			if (!handledKeys.includes(event.key)) return;

			const items = getEnabledItems();
			if (items.length === 0) return;

			const current = items.indexOf(
				document.activeElement as HTMLButtonElement,
			);

			let nextIndex: number;
			if (event.key === "Home") {
				nextIndex = 0;
			} else if (event.key === "End") {
				nextIndex = items.length - 1;
			} else if (current < 0) {
				nextIndex = event.key === "ArrowUp" ? items.length - 1 : 0;
			} else {
				nextIndex =
					(current + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
					items.length;
			}

			event.preventDefault();
			event.stopImmediatePropagation();
			focusElement(items[nextIndex]);
		};

		groupEl.addEventListener("keydown", handleKeyDown, true);
		return () => {
			groupEl.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [getEnabledItems, hideMenu, visibleItemCount]);

	// Close menu on outside focus (and outside pointer click when native Popover API is unavailable)
	useEffect(() => {
		if (!isOpen) return;

		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (
				triggerRef.current?.contains(target) ||
				popoverRef.current?.contains(target)
			) {
				return;
			}
			hideMenu({ restoreFocus: false });
		};

		const handleResizeOrScroll = () => {
			positionFallback();
		};

		document.addEventListener("focusin", handleFocusIn);
		window.addEventListener("resize", handleResizeOrScroll);

		let removeFallbackPointerListener: (() => void) | undefined;
		if (!supportsNativePopover()) {
			const handleOutsidePointerDown = (event: PointerEvent) => {
				const target = event.target as Node | null;
				if (!target) return;
				if (
					triggerRef.current?.contains(target) ||
					popoverRef.current?.contains(target)
				) {
					return;
				}
				hideMenu({ restoreFocus: false });
			};
			document.addEventListener("pointerdown", handleOutsidePointerDown);
			removeFallbackPointerListener = () => {
				document.removeEventListener("pointerdown", handleOutsidePointerDown);
			};
		}

		return () => {
			document.removeEventListener("focusin", handleFocusIn);
			window.removeEventListener("resize", handleResizeOrScroll);
			removeFallbackPointerListener?.();
		};
	}, [isOpen, hideMenu, positionFallback]);

	const handleTriggerPointerDown = (
		event: React.PointerEvent<HTMLButtonElement>,
	) => {
		event.preventDefault();
		pointerTriggerRef.current = true;
	};

	const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		const fromPointer = pointerTriggerRef.current;
		pointerTriggerRef.current = false;

		if (!fromPointer && !isOpenRef.current) {
			enterOnOpenRef.current = true;
		} else {
			enterOnOpenRef.current = false;
		}

		if (supportsInvokerCommands() && supportsNativePopover()) {
			return;
		}

		event.preventDefault();
		if (isOpenRef.current) {
			hideMenu({ restoreFocus: true, fromPointer });
		} else {
			showMenu();
		}
	};

	const handleTriggerKeyDown = (
		event: React.KeyboardEvent<HTMLButtonElement>,
	) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			if (isOpenRef.current) {
				focusElement(getEnabledItems()[0]);
			} else {
				enterOnOpenRef.current = true;
				triggerRef.current?.click();
			}
		} else if (event.key === "Escape" && isOpenRef.current) {
			event.preventDefault();
			event.stopPropagation();
			hideMenu({ restoreFocus: true, fromPointer: false });
		}
	};

	if (visibleGroups.length === 0) return null;

	return (
		<>
			<button
				ref={triggerRef}
				id={triggerId}
				type="button"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-label={triggerLabel}
				title={triggerLabel}
				{...({
					commandfor: menuId,
					command: "toggle-popover",
				} as Record<string, string>)}
				onPointerDown={handleTriggerPointerDown}
				onClick={handleTriggerClick}
				onKeyDown={handleTriggerKeyDown}
				className={`action-menu-trigger text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 ${triggerClassName}`}
			>
				{triggerIcon}
			</button>
			<div
				ref={popoverRef}
				id={menuId}
				{...({ popover: "auto" } as Record<string, string>)}
				className={`action-menu-popover min-w-[10.5rem] bg-[var(--modal-bg)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl shadow-xl py-1 ${popoverClassName} ${
					!supportsNativePopover() && isOpen ? "popover-fallback-open" : ""
				}`}
			>
				<div
					ref={groupRef}
					// focusgroup="menu nomemory" infers role="menu" natively (so aria-labelledby is valid without an explicit role)
					{...({
						focusgroup: "menu nomemory",
						"aria-labelledby": triggerId,
					} as Record<string, string>)}
					className="action-menu-list"
				>
					{visibleGroups.map((group, groupIndex) => (
						<Fragment key={group.id}>
							{groupIndex > 0 && (
								<hr className="my-1 border-0 border-t border-[var(--border-color)]" />
							)}
							{group.items.map((item) => {
								const isCheckable = item.checked !== undefined;
								const scheduleCheckableClose = (fromPointer: boolean) => {
									clearPendingClose();
									closeTimerRef.current = setTimeout(() => {
										closeTimerRef.current = null;
										hideMenu({ restoreFocus: true, fromPointer });
									}, 300);
								};
								const itemClassName = `action-menu-item w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold transition-colors text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-500 ${
									item.variant === "danger"
										? "text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10"
										: "text-[var(--text-primary)] hover:bg-[var(--bg-input)] focus:bg-[var(--bg-input)]"
								}`;
								const handleItemPointerMove = (
									event: React.PointerEvent<HTMLButtonElement>,
								) => {
									if (
										!item.disabled &&
										document.activeElement !== event.currentTarget
									) {
										focusElement(event.currentTarget, {
											focusVisible: false,
										});
									}
								};

								if (isCheckable) {
									return (
										<button
											key={item.id}
											type="button"
											role="menuitemcheckbox"
											aria-checked={item.checked}
											disabled={item.disabled}
											onPointerMove={handleItemPointerMove}
											onKeyDown={(event) => {
												if (event.key === " ") {
													event.preventDefault();
													clearPendingClose();
													void item.onSelect();
												} else if (event.key === "Enter") {
													event.preventDefault();
													void item.onSelect();
													scheduleCheckableClose(false);
												}
											}}
											onClick={(event) => {
												const fromPointer = event.detail !== 0;
												void item.onSelect();
												scheduleCheckableClose(fromPointer);
											}}
											className={itemClassName}
										>
											{item.icon && (
												<span
													className="inline-flex items-center justify-center flex-none w-4 h-4"
													aria-hidden="true"
												>
													{item.icon}
												</span>
											)}
											<span className="truncate">{item.label}</span>
										</button>
									);
								}

								return (
									<button
										key={item.id}
										type="button"
										disabled={item.disabled}
										onPointerMove={handleItemPointerMove}
										onClick={(event) => {
											const fromPointer = event.detail !== 0;
											hideMenu({ restoreFocus: true, fromPointer });
											void item.onSelect();
										}}
										className={itemClassName}
									>
										<span
											className="inline-flex items-center justify-center flex-none w-4 h-4"
											aria-hidden="true"
										>
											{item.icon}
										</span>
										<span className="truncate">{item.label}</span>
									</button>
								);
							})}
						</Fragment>
					))}
				</div>
			</div>
		</>
	);
};
