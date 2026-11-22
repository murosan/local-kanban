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
	CheckSquare,
	ChevronDown,
	ChevronUp,
	GripVertical,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { ChecklistItem, CustomFieldValue } from "../../types/task";
import { normalizeChecklistItems } from "../../utils/checklistField";
import {
	moveItemByOffset,
	prefersReducedMotion,
	reorderItemsById,
} from "../../utils/reorder";

interface SortableChecklistItemProps {
	item: ChecklistItem;
	index: number;
	total: number;
	onToggle: (itemId: string) => void;
	onUpdateText: (itemId: string, newText: string) => void;
	onMove: (index: number, direction: "up" | "down") => void;
	onRemove: (itemId: string) => void;
	registerItemRef: (itemId: string, el: HTMLDivElement | null) => void;
	registerMoveButtonRef: (
		itemId: string,
		dir: "up" | "down",
		el: HTMLButtonElement | null,
	) => void;
}

const SortableChecklistItem: React.FC<SortableChecklistItemProps> = ({
	item,
	index,
	total,
	onToggle,
	onUpdateText,
	onMove,
	onRemove,
	registerItemRef,
	registerMoveButtonRef,
}) => {
	const { t } = useI18n();
	const isReorderable = total > 1;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id, disabled: !isReorderable });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const setCombinedRef = useCallback(
		(node: HTMLDivElement | null) => {
			setNodeRef(node);
			registerItemRef(item.id, node);
		},
		[item.id, registerItemRef, setNodeRef],
	);

	const itemDisplayName =
		item.text.trim() ||
		t("taskModal.checklistItemFallbackName", { index: index + 1 });

	return (
		<div
			ref={setCombinedRef}
			style={style}
			onFocusCapture={(e) => {
				if (
					e.target instanceof HTMLElement &&
					e.target.matches(":focus-visible")
				) {
					e.currentTarget.scrollIntoView({
						block: "nearest",
						inline: "nearest",
					});
				}
			}}
			className={`sortable-checklist-item flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--border-color)]/80 transition-shadow ${
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
					aria-label={t("taskModal.dragToReorderChecklistItem", {
						name: itemDisplayName,
					})}
					title={t("taskModal.dragToReorderChecklistItem", {
						name: itemDisplayName,
					})}
				>
					<GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
				</button>
				<input
					type="checkbox"
					checked={item.completed}
					onChange={() => onToggle(item.id)}
					aria-label={itemDisplayName}
					className="w-4 h-4 text-blue-600 rounded border border-[var(--border-color)] focus:ring-blue-500 shrink-0 cursor-pointer"
				/>
				<input
					type="text"
					value={item.text}
					onChange={(e) => onUpdateText(item.id, e.target.value)}
					aria-label={itemDisplayName}
					className={`w-full text-xs bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-blue-500 focus:bg-[var(--bg-input)] px-1 py-0.5 rounded outline-none flex-1 min-w-0 truncate transition-all ${
						item.completed
							? "line-through text-[var(--text-muted)] opacity-70"
							: "text-[var(--text-primary)] font-medium"
					}`}
				/>
			</div>

			<div className="flex items-center space-x-0.5 shrink-0">
				{isReorderable && (
					<>
						<button
							ref={(el) => registerMoveButtonRef(item.id, "up", el)}
							type="button"
							disabled={index === 0}
							onClick={() => onMove(index, "up")}
							className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
							aria-label={t("taskModal.moveChecklistItemUp", {
								name: itemDisplayName,
							})}
							title={t("taskModal.moveChecklistItemUp", {
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
							className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
							aria-label={t("taskModal.moveChecklistItemDown", {
								name: itemDisplayName,
							})}
							title={t("taskModal.moveChecklistItemDown", {
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
					className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded transition-colors shrink-0 opacity-80 hover:opacity-100 cursor-pointer"
					aria-label={t("taskModal.removeChecklistItem")}
					title={t("taskModal.removeChecklistItem")}
				>
					<X className="w-3.5 h-3.5" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
};

interface ChecklistFieldEditorProps {
	field: CustomFieldValue;
	onToggleItem: (itemId: string) => void;
	onUpdateItemText: (itemId: string, newText: string) => void;
	onRemoveItem: (itemId: string) => void;
	onAddItem: (itemText: string) => void;
	onReorderItems: (nextItems: ChecklistItem[]) => void;
	onDragStateChange?: (isDragging: boolean) => void;
}

export const ChecklistFieldEditor: React.FC<ChecklistFieldEditorProps> = ({
	field,
	onToggleItem,
	onUpdateItemText,
	onRemoveItem,
	onAddItem,
	onReorderItems,
	onDragStateChange,
}) => {
	const { t } = useI18n();
	const [inputText, setInputText] = useState("");
	const [liveAnnouncement, setLiveAnnouncement] = useState("");

	const isDraggingRef = useRef(false);
	const onDragStateChangeRef = useRef(onDragStateChange);
	onDragStateChangeRef.current = onDragStateChange;
	const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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

	const items = normalizeChecklistItems(field.value, `item-${field.id}`);
	const completedCount = items.filter((i) => i.completed).length;
	const totalCount = items.length;
	const progressPercent =
		totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

	const registerItemRef = useCallback(
		(itemId: string, el: HTMLDivElement | null) => {
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

	const getItemDisplayName = (item: ChecklistItem, index: number) =>
		item.text.trim() ||
		t("taskModal.checklistItemFallbackName", { index: index + 1 });

	const handleMoveItem = (index: number, direction: "up" | "down") => {
		const delta = direction === "up" ? -1 : 1;
		const reordered = moveItemByOffset(items, index, delta);
		if (reordered === items) return;

		const targetIndex = index + delta;
		const movedItem = reordered[targetIndex];
		onReorderItems(reordered);
		announce(
			t("taskModal.checklistItemMovedAnnouncement", {
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
			items,
			String(active.id),
			String(over.id),
		);
		if (reordered === items) return;

		const newIndex = reordered.findIndex((i) => i.id === String(active.id));
		onReorderItems(reordered);
		if (newIndex !== -1) {
			const movedItem = reordered[newIndex];
			announce(
				t("taskModal.checklistItemMovedAnnouncement", {
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

		const activeIndex = items.findIndex(
			(i) => i.id === String(event.active.id),
		);
		if (activeIndex !== -1) {
			const activeItem = items[activeIndex];
			announce(
				t("taskModal.checklistItemMoveCancelled", {
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

	const handleSubmitItem = () => {
		if (!inputText.trim()) return;
		onAddItem(inputText);
		setInputText("");
	};

	return (
		<div className="space-y-2.5 bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)]">
			{/* Progress Header */}
			<div className="flex items-center justify-between text-xs">
				<span className="font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
					<CheckSquare className="w-3.5 h-3.5 text-blue-500" />
					<span>進捗状況</span>
				</span>
				<span className="font-bold text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
					{t("taskModal.checklistCompleted", {
						completed: completedCount,
						total: totalCount,
					}) || `${completedCount}/${totalCount} 完了`}{" "}
					({progressPercent}%)
				</span>
			</div>

			{/* Progress Bar */}
			<div className="w-full h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden border border-[var(--border-color)]">
				<div
					className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			<div className="sr-only" aria-live="polite" aria-atomic="true">
				{liveAnnouncement}
			</div>

			{/* Items List */}
			<div className="space-y-1.5 pt-1">
				{items.length > 0 ? (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onDragCancel={handleDragCancel}
					>
						<SortableContext
							items={items.map((item) => item.id)}
							strategy={verticalListSortingStrategy}
						>
							{items.map((item, idx) => (
								<SortableChecklistItem
									key={item.id}
									item={item}
									index={idx}
									total={items.length}
									onToggle={onToggleItem}
									onUpdateText={onUpdateItemText}
									onMove={handleMoveItem}
									onRemove={onRemoveItem}
									registerItemRef={registerItemRef}
									registerMoveButtonRef={registerMoveButtonRef}
								/>
							))}
						</SortableContext>
					</DndContext>
				) : (
					<p className="text-xs text-[var(--text-muted)] italic py-1 text-center">
						{t("taskModal.noChecklistItems") || "チェック項目がありません"}
					</p>
				)}
			</div>

			{/* Add Item Input Form */}
			<div className="flex items-center gap-1.5 pt-1">
				<input
					type="text"
					value={inputText}
					onChange={(e) => setInputText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.nativeEvent.isComposing) {
							e.preventDefault();
							handleSubmitItem();
						}
					}}
					placeholder={t("taskModal.itemPlaceholder") || "新しい項目を入力..."}
					className="flex-1 px-2.5 py-1 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
				/>
				<button
					type="button"
					onClick={handleSubmitItem}
					disabled={!inputText.trim()}
					className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shrink-0 disabled:opacity-50 transition-colors"
				>
					{t("taskModal.addChecklistItem") || "追加"}
				</button>
			</div>
		</div>
	);
};
