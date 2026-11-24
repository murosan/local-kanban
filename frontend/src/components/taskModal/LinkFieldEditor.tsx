import {
	closestCenter,
	DndContext,
	type DragCancelEvent,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	AlertCircle,
	Check,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	GripVertical,
	Link2,
	Pencil,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { CustomFieldValue, LinkItem } from "../../types/task";
import {
	createLinkItem,
	getLinkDisplayText,
	normalizeLinkItems,
} from "../../utils/linkField";
import {
	moveItemByOffset,
	prefersReducedMotion,
	reorderItemsById,
} from "../../utils/reorder";
import { getSafeUrl, isValidUrl } from "../../utils/url";
import { CopyButton } from "../CopyButton";

interface EditingLinkState {
	itemId: string;
	url: string;
	label: string;
	touched: boolean;
}

interface SortableLinkItemProps {
	item: LinkItem;
	index: number;
	total: number;
	fieldId: string;
	modalInstanceId: string;
	editingItem: EditingLinkState | null;
	editLinkUrlInputRef: React.RefObject<HTMLInputElement | null>;
	onStartEdit: (item: LinkItem) => void;
	onChangeEditingItem: (
		updater: (prev: EditingLinkState | null) => EditingLinkState | null,
	) => void;
	onCancelEdit: () => void;
	onFinishEdit: () => void;
	onAnnounceValidationError: (message: string) => void;
	onMove: (index: number, direction: "up" | "down") => void;
	onRemove: (itemId: string) => void;
	registerItemRef: (itemId: string, el: HTMLLIElement | null) => void;
	registerMoveButtonRef: (
		itemId: string,
		dir: "up" | "down",
		el: HTMLButtonElement | null,
	) => void;
}

const SortableLinkItem: React.FC<SortableLinkItemProps> = ({
	item,
	index,
	total,
	fieldId,
	modalInstanceId,
	editingItem,
	editLinkUrlInputRef,
	onStartEdit,
	onChangeEditingItem,
	onCancelEdit,
	onFinishEdit,
	onAnnounceValidationError,
	onMove,
	onRemove,
	registerItemRef,
	registerMoveButtonRef,
}) => {
	const { t } = useI18n();
	const isReorderable = total > 1;
	const isEditing = editingItem?.itemId === item.id;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: item.id,
		disabled: !isReorderable
			? true
			: isEditing
				? { draggable: true, droppable: false }
				: false,
	});

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const setCombinedRef = useCallback(
		(node: HTMLLIElement | null) => {
			setNodeRef(node);
			registerItemRef(item.id, node);
		},
		[item.id, registerItemRef, setNodeRef],
	);

	const handleFocusCapture = (e: React.FocusEvent<HTMLLIElement>) => {
		if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) {
			e.currentTarget.scrollIntoView({
				block: "nearest",
				inline: "nearest",
			});
		}
	};

	const safeUrl = getSafeUrl(item.url);
	const displayText = getLinkDisplayText(item);
	const itemDisplayName =
		displayText.trim() ||
		t("taskModal.linkItemFallbackName", { index: index + 1 });
	const linkElementId = `${modalInstanceId}-link-${fieldId}-${item.id}`;

	if (isEditing && editingItem) {
		const isEditUrlInvalid = Boolean(
			editingItem.touched && !isValidUrl(editingItem.url),
		);
		const editLinkErrorId = `${modalInstanceId}-link-edit-error-${fieldId}-${item.id}`;

		return (
			<li
				ref={setCombinedRef}
				style={style}
				onFocusCapture={handleFocusCapture}
				className="sortable-link-item p-2 rounded-lg bg-[var(--bg-surface)] border border-blue-500/40 space-y-2"
			>
				<div className="flex flex-col sm:flex-row gap-1.5">
					<input
						type="text"
						value={editingItem.label}
						onChange={(e) =>
							onChangeEditingItem((prev) =>
								prev ? { ...prev, label: e.target.value } : null,
							)
						}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								onFinishEdit();
							}
						}}
						placeholder={t("taskModal.linkLabelPlaceholder")}
						className="sm:w-1/3 px-2.5 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
					/>
					<input
						ref={editLinkUrlInputRef}
						type="text"
						autoFocus
						value={editingItem.url}
						aria-invalid={isEditUrlInvalid ? "true" : "false"}
						aria-describedby={isEditUrlInvalid ? editLinkErrorId : undefined}
						onChange={(e) => {
							const nextUrl = e.target.value;
							onChangeEditingItem((prev) =>
								prev ? { ...prev, url: nextUrl } : null,
							);
							if (isValidUrl(nextUrl)) {
								onAnnounceValidationError("");
							}
						}}
						onBlur={() => {
							const invalid = !isValidUrl(editingItem.url);
							onChangeEditingItem((prev) =>
								prev ? { ...prev, touched: true } : null,
							);
							if (invalid) {
								onAnnounceValidationError(t("taskModal.invalidUrlError"));
							}
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								onFinishEdit();
							}
						}}
						placeholder={t("taskModal.linkUrlPlaceholder")}
						className={`flex-1 px-2.5 py-1.5 text-xs bg-[var(--bg-input)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none ${
							isEditUrlInvalid
								? "border-rose-500 focus:border-rose-500"
								: "border-[var(--border-color)] focus:border-blue-500"
						}`}
					/>
				</div>
				{isEditUrlInvalid && (
					<p
						id={editLinkErrorId}
						className="flex items-center space-x-1.5 text-[11px] text-rose-500 font-medium"
					>
						<AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
						<span>{t("taskModal.invalidUrlError")}</span>
					</p>
				)}
				<div className="flex items-center justify-end gap-1.5">
					<button
						type="button"
						onClick={onCancelEdit}
						className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors cursor-pointer"
					>
						{t("taskModal.cancel")}
					</button>
					<button
						type="button"
						onClick={onFinishEdit}
						className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
					>
						<Check className="w-3.5 h-3.5" aria-hidden="true" />
						<span>{t("taskModal.doneEditLink")}</span>
					</button>
					<button
						type="button"
						onClick={() => onRemove(item.id)}
						className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded transition-colors cursor-pointer"
						aria-label={t("taskModal.removeLink")}
						title={t("taskModal.removeLink")}
					>
						<X className="w-3.5 h-3.5" aria-hidden="true" />
					</button>
				</div>
			</li>
		);
	}

	return (
		<li
			ref={setCombinedRef}
			style={style}
			onFocusCapture={handleFocusCapture}
			className={`sortable-link-item flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--border-color)]/80 transition-shadow ${
				isDragging
					? "relative z-50 bg-[var(--bg-card)] ring-2 ring-blue-500 shadow-lg border-transparent"
					: ""
			}`}
		>
			<div className="flex items-center space-x-1.5 flex-1 min-w-0">
				<button
					type="button"
					disabled={!isReorderable}
					{...(isReorderable ? attributes : undefined)}
					{...(isReorderable ? listeners : undefined)}
					className="drag-handle nested-drag-handle cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] focus-visible:bg-[var(--bg-input)] disabled:opacity-30 disabled:cursor-not-allowed p-0.5 rounded transition-colors shrink-0"
					aria-label={t("taskModal.dragToReorderLinkItem", {
						name: itemDisplayName,
					})}
					title={t("taskModal.dragToReorderLinkItem", {
						name: itemDisplayName,
					})}
				>
					<GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
				</button>
				{safeUrl ? (
					<a
						id={linkElementId}
						href={safeUrl}
						target="_blank"
						rel="noopener noreferrer"
						data-copy-text={item.url}
						className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-500 hover:underline truncate min-w-0"
						title={item.url}
					>
						<ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
						<span className="truncate">{displayText}</span>
					</a>
				) : (
					<span
						id={linkElementId}
						data-copy-text={item.url}
						className="inline-flex items-center space-x-1.5 text-xs text-[var(--text-muted)] truncate min-w-0"
						title={item.url}
					>
						<Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
						<span className="truncate">
							{displayText || t("taskModal.emptyLink")}
						</span>
					</span>
				)}
			</div>

			<div className="flex items-center space-x-0.5 shrink-0">
				{item.url.trim() && (
					<CopyButton
						targetId={linkElementId}
						ariaLabel={t("taskModal.copyLink", {
							name: displayText,
						})}
						size="md"
					/>
				)}
				<button
					type="button"
					onClick={() => onStartEdit(item)}
					className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-blue-500 hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
					aria-label={t("taskModal.editLink")}
					title={t("taskModal.editLink")}
				>
					<Pencil className="w-3.5 h-3.5" aria-hidden="true" />
				</button>
				{isReorderable && (
					<>
						<button
							ref={(el) => registerMoveButtonRef(item.id, "up", el)}
							type="button"
							disabled={index === 0}
							onClick={() => onMove(index, "up")}
							className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
							aria-label={t("taskModal.moveLinkItemUp", {
								name: itemDisplayName,
							})}
							title={t("taskModal.moveLinkItemUp", {
								name: itemDisplayName,
							})}
						>
							<ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
						</button>
						<button
							ref={(el) => registerMoveButtonRef(item.id, "down", el)}
							type="button"
							disabled={index === total - 1}
							onClick={() => onMove(index, "down")}
							className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
							aria-label={t("taskModal.moveLinkItemDown", {
								name: itemDisplayName,
							})}
							title={t("taskModal.moveLinkItemDown", {
								name: itemDisplayName,
							})}
						>
							<ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
						</button>
					</>
				)}
				<button
					type="button"
					onClick={() => onRemove(item.id)}
					className="min-w-6 min-h-6 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
					aria-label={t("taskModal.removeLink")}
					title={t("taskModal.removeLink")}
				>
					<X className="w-3.5 h-3.5" aria-hidden="true" />
				</button>
			</div>
		</li>
	);
};

interface LinkFieldEditorProps {
	field: CustomFieldValue;
	modalInstanceId: string;
	onUpdateLinks: (nextItems: LinkItem[]) => void;
	onAnnounceValidationError: (message: string) => void;
	onDragStateChange?: (isDragging: boolean) => void;
}

export const LinkFieldEditor: React.FC<LinkFieldEditorProps> = ({
	field,
	modalInstanceId,
	onUpdateLinks,
	onAnnounceValidationError,
	onDragStateChange,
}) => {
	const { t } = useI18n();
	const [newUrl, setNewUrl] = useState("");
	const [newLabel, setNewLabel] = useState("");
	const [newTouched, setNewTouched] = useState(false);
	const [liveAnnouncement, setLiveAnnouncement] = useState("");

	const [editingItem, setEditingItem] = useState<EditingLinkState | null>(null);

	const newLinkUrlInputRef = useRef<HTMLInputElement | null>(null);
	const editLinkUrlInputRef = useRef<HTMLInputElement | null>(null);
	const isDraggingRef = useRef(false);
	const onDragStateChangeRef = useRef(onDragStateChange);
	onDragStateChangeRef.current = onDragStateChange;
	const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
	const moveButtonRefs = useRef<
		Map<
			string,
			{ up?: HTMLButtonElement | null; down?: HTMLButtonElement | null }
		>
	>(new Map());

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	useEffect(() => {
		return () => {
			if (announceTimerRef.current) {
				clearTimeout(announceTimerRef.current);
			}
			if (isDraggingRef.current) {
				isDraggingRef.current = false;
				onDragStateChangeRef.current?.(false);
				document.documentElement.classList.remove("is-dragging-item");
			}
		};
	}, []);

	const linkItems = normalizeLinkItems(field.value, `link-${field.id}`);

	const isNewUrlInvalid = Boolean(
		newTouched && newUrl.trim() && !isValidUrl(newUrl),
	);
	const newLinkErrorId = `${modalInstanceId}-link-error-${field.id}`;

	const registerItemRef = useCallback(
		(itemId: string, el: HTMLLIElement | null) => {
			if (el) {
				itemRefs.current.set(itemId, el);
			} else {
				itemRefs.current.delete(itemId);
			}
		},
		[],
	);

	const registerMoveButtonRef = useCallback(
		(itemId: string, dir: "up" | "down", el: HTMLButtonElement | null) => {
			const entry = moveButtonRefs.current.get(itemId) || {};
			entry[dir] = el;
			if (!entry.up && !entry.down) {
				moveButtonRefs.current.delete(itemId);
			} else {
				moveButtonRefs.current.set(itemId, entry);
			}
		},
		[],
	);

	const announce = useCallback((message: string) => {
		if (announceTimerRef.current) {
			clearTimeout(announceTimerRef.current);
		}
		setLiveAnnouncement("");
		announceTimerRef.current = setTimeout(() => {
			setLiveAnnouncement(message);
		}, 500);
	}, []);

	const getItemDisplayName = (item: LinkItem, index: number) =>
		getLinkDisplayText(item).trim() ||
		t("taskModal.linkItemFallbackName", { index: index + 1 });

	const handleMoveItem = (index: number, direction: "up" | "down") => {
		const delta = direction === "up" ? -1 : 1;
		const reordered = moveItemByOffset(linkItems, index, delta);
		if (reordered === linkItems) return;

		const targetIndex = index + delta;
		const movedItem = reordered[targetIndex];
		onUpdateLinks(reordered);
		announce(
			t("taskModal.linkItemMovedAnnouncement", {
				name: getItemDisplayName(movedItem, targetIndex),
				position: targetIndex + 1,
				total: reordered.length,
			}),
		);

		requestAnimationFrame(() => {
			const itemEl = itemRefs.current.get(movedItem.id);
			itemEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
			const buttons = moveButtonRefs.current.get(movedItem.id);
			const hitStart = direction === "up" && targetIndex === 0;
			const hitEnd =
				direction === "down" && targetIndex === reordered.length - 1;
			const targetBtn =
				hitStart && buttons?.down
					? buttons.down
					: hitEnd && buttons?.up
						? buttons.up
						: buttons?.[direction];
			targetBtn?.focus({ preventScroll: true });
		});
	};

	const handleDragStart = () => {
		isDraggingRef.current = true;
		onDragStateChange?.(true);
		document.documentElement.classList.add("is-dragging-item");
	};

	const handleDragEnd = (event: DragEndEvent) => {
		isDraggingRef.current = false;
		onDragStateChange?.(false);
		document.documentElement.classList.remove("is-dragging-item");

		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const reordered = reorderItemsById(
			linkItems,
			String(active.id),
			String(over.id),
		);
		if (reordered === linkItems) return;

		const newIndex = reordered.findIndex((i) => i.id === String(active.id));
		onUpdateLinks(reordered);
		if (newIndex !== -1) {
			const movedItem = reordered[newIndex];
			announce(
				t("taskModal.linkItemMovedAnnouncement", {
					name: getItemDisplayName(movedItem, newIndex),
					position: newIndex + 1,
					total: reordered.length,
				}),
			);
			requestAnimationFrame(() => {
				itemRefs.current
					.get(movedItem.id)
					?.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		}
	};

	const handleDragCancel = (event: DragCancelEvent) => {
		isDraggingRef.current = false;
		onDragStateChange?.(false);
		document.documentElement.classList.remove("is-dragging-item");

		const activeIndex = linkItems.findIndex(
			(i) => i.id === String(event.active.id),
		);
		if (activeIndex !== -1) {
			const activeItem = linkItems[activeIndex];
			announce(
				t("taskModal.linkItemMoveCancelled", {
					name: getItemDisplayName(activeItem, activeIndex),
				}),
			);
			requestAnimationFrame(() => {
				itemRefs.current
					.get(activeItem.id)
					?.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		}
	};

	const handleAdd = () => {
		if (!newUrl.trim()) return;
		const newItem = createLinkItem(newUrl, newLabel);
		if (!newItem) {
			setNewTouched(true);
			onAnnounceValidationError(t("taskModal.invalidUrlError"));
			newLinkUrlInputRef.current?.focus();
			return;
		}
		onAnnounceValidationError("");
		onUpdateLinks([...linkItems, newItem]);
		setNewUrl("");
		setNewLabel("");
		setNewTouched(false);
	};

	const handleStartEdit = (item: LinkItem) => {
		setEditingItem({
			itemId: item.id,
			url: item.url,
			label: item.label ?? "",
			touched: false,
		});
	};

	const handleCancelEdit = () => {
		setEditingItem(null);
		onAnnounceValidationError("");
	};

	const handleFinishEdit = () => {
		if (!editingItem) return;
		const safeUrl = getSafeUrl(editingItem.url);
		if (!safeUrl) {
			setEditingItem((prev) => (prev ? { ...prev, touched: true } : null));
			onAnnounceValidationError(t("taskModal.invalidUrlError"));
			editLinkUrlInputRef.current?.focus();
			return;
		}
		onAnnounceValidationError("");
		const trimmedLabel = editingItem.label.trim();
		const nextItems = linkItems.map((item) => {
			if (item.id !== editingItem.itemId) return item;
			const cleaned: LinkItem = {
				id: item.id,
				url: safeUrl,
			};
			if (trimmedLabel) {
				cleaned.label = trimmedLabel;
			}
			return cleaned;
		});
		onUpdateLinks(nextItems);
		setEditingItem(null);
	};

	const handleRemove = (itemId: string) => {
		const targetItem = linkItems.find((item) => item.id === itemId);
		const linkName = targetItem
			? getLinkDisplayText(targetItem) || targetItem.url
			: "";
		const confirmMessage = linkName
			? t("taskModal.removeLinkConfirm", { name: linkName })
			: t("taskModal.removeLinkConfirmGeneric");
		if (!confirm(confirmMessage)) {
			return;
		}
		if (editingItem?.itemId === itemId) {
			setEditingItem(null);
		}
		onUpdateLinks(linkItems.filter((item) => item.id !== itemId));
	};

	return (
		<div className="space-y-2.5 bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)]">
			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{liveAnnouncement}
			</div>

			{/* Links List */}
			{linkItems.length > 0 ? (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onDragCancel={handleDragCancel}
				>
					<SortableContext
						items={linkItems.map((item) => item.id)}
						strategy={verticalListSortingStrategy}
					>
						<ul className="space-y-1.5">
							{linkItems.map((item, idx) => (
								<SortableLinkItem
									key={item.id}
									item={item}
									index={idx}
									total={linkItems.length}
									fieldId={field.id}
									modalInstanceId={modalInstanceId}
									editingItem={editingItem}
									editLinkUrlInputRef={editLinkUrlInputRef}
									onStartEdit={handleStartEdit}
									onChangeEditingItem={setEditingItem}
									onCancelEdit={handleCancelEdit}
									onFinishEdit={handleFinishEdit}
									onAnnounceValidationError={onAnnounceValidationError}
									onMove={handleMoveItem}
									onRemove={handleRemove}
									registerItemRef={registerItemRef}
									registerMoveButtonRef={registerMoveButtonRef}
								/>
							))}
						</ul>
					</SortableContext>
				</DndContext>
			) : (
				<p className="text-xs text-[var(--text-muted)] italic py-1 text-center">
					{t("taskModal.noLinks")}
				</p>
			)}

			{/* Add Link Input Form */}
			<div className="space-y-1.5 pt-1">
				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
					<input
						type="text"
						value={newLabel}
						onChange={(e) => setNewLabel(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								handleAdd();
							}
						}}
						placeholder={t("taskModal.linkLabelPlaceholder")}
						className="sm:w-1/3 px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
					/>
					<input
						ref={newLinkUrlInputRef}
						type="text"
						value={newUrl}
						aria-invalid={isNewUrlInvalid ? "true" : "false"}
						aria-describedby={isNewUrlInvalid ? newLinkErrorId : undefined}
						onChange={(e) => {
							const nextUrl = e.target.value;
							setNewUrl(nextUrl);
							if (!nextUrl.trim()) {
								setNewTouched(false);
								onAnnounceValidationError("");
							} else if (isValidUrl(nextUrl)) {
								onAnnounceValidationError("");
							}
						}}
						onBlur={() => {
							if (!newUrl.trim()) return;
							const invalid = !isValidUrl(newUrl);
							setNewTouched(true);
							if (invalid) {
								onAnnounceValidationError(t("taskModal.invalidUrlError"));
							}
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								e.preventDefault();
								handleAdd();
							}
						}}
						placeholder={t("taskModal.linkUrlPlaceholder")}
						className={`flex-1 px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none ${
							isNewUrlInvalid
								? "border-rose-500 focus:border-rose-500"
								: "border-[var(--border-color)] focus:border-blue-500"
						}`}
					/>
					<button
						type="button"
						onClick={handleAdd}
						disabled={!newUrl.trim()}
						className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shrink-0 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
					>
						{t("taskModal.addLinkItem")}
					</button>
				</div>
				{isNewUrlInvalid && (
					<p
						id={newLinkErrorId}
						className="flex items-center space-x-1.5 text-[11px] text-rose-500 font-medium"
					>
						<AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
						<span>{t("taskModal.invalidUrlError")}</span>
					</p>
				)}
			</div>
		</div>
	);
};
