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
	ChevronDown,
	ChevronUp,
	GripVertical,
	Maximize2,
	Minimize2,
	Plus,
	Sliders,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COLOR_PRESETS } from "../constants/colors";
import { getCustomFieldTypeKey } from "../i18n/translations";
import { useI18n } from "../i18n/useI18n";
import type {
	Column,
	CustomFieldDef,
	CustomFieldOption,
	CustomFieldType,
} from "../types/task";
import {
	ensureUniqueIds,
	moveItemByOffset,
	prefersReducedMotion,
	reorderItemsById,
} from "../utils/reorder";

interface SortableChecklistPresetOptionProps {
	option: CustomFieldOption;
	index: number;
	total: number;
	fieldIndex: number;
	onOptionValueChange: (
		fieldIndex: number,
		optionId: string,
		newValue: string,
	) => void;
	onOptionColorChange: (
		fieldIndex: number,
		optionId: string,
		color: string,
	) => void;
	onRemoveOption: (fieldIndex: number, optionId: string) => void;
	onMoveOption: (index: number, direction: "up" | "down") => void;
	registerItemRef: (optionId: string, el: HTMLDivElement | null) => void;
	registerMoveButtonRef: (
		optionId: string,
		dir: "up" | "down",
		el: HTMLButtonElement | null,
	) => void;
}

const SortableChecklistPresetOption: React.FC<
	SortableChecklistPresetOptionProps
> = ({
	option,
	index,
	total,
	fieldIndex,
	onOptionValueChange,
	onOptionColorChange,
	onRemoveOption,
	onMoveOption,
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
	} = useSortable({ id: option.id, disabled: !isReorderable });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const setCombinedRef = useCallback(
		(node: HTMLDivElement | null) => {
			setNodeRef(node);
			registerItemRef(option.id, node);
		},
		[option.id, registerItemRef, setNodeRef],
	);

	const optionDisplayName =
		option.value.trim() ||
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
			className={`sortable-checklist-item flex flex-wrap sm:flex-nowrap items-center justify-between p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] gap-2 transition-shadow ${
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
					aria-label={t("configModal.dragToReorderChecklistItem", {
						name: optionDisplayName,
					})}
					title={t("configModal.dragToReorderChecklistItem", {
						name: optionDisplayName,
					})}
				>
					<GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
				</button>
				<span
					className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
					style={{
						backgroundColor: option.color || "#3b82f6",
					}}
				/>
				<input
					type="text"
					value={option.value}
					onChange={(e) =>
						onOptionValueChange(fieldIndex, option.id, e.target.value)
					}
					className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2 py-0.5 text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 outline-none"
				/>
			</div>

			{/* Color Swatch Picker & Reorder/Delete Controls */}
			<div className="flex items-center space-x-1 justify-end shrink-0">
				{COLOR_PRESETS.map((colorHex) => (
					<button
						key={colorHex}
						type="button"
						onClick={() => onOptionColorChange(fieldIndex, option.id, colorHex)}
						className={`w-4 h-4 rounded-full transition-transform ${
							option.color === colorHex
								? "scale-125 ring-2 ring-white/60 shadow-md"
								: "hover:scale-110 opacity-70 hover:opacity-100"
						}`}
						style={{ backgroundColor: colorHex }}
					/>
				))}
				{isReorderable && (
					<div className="flex items-center space-x-0.5 pl-1">
						<button
							ref={(el) => registerMoveButtonRef(option.id, "up", el)}
							type="button"
							disabled={index === 0}
							onClick={() => onMoveOption(index, "up")}
							className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
							aria-label={t("configModal.moveChecklistItemUp", {
								name: optionDisplayName,
							})}
							title={t("configModal.moveChecklistItemUp", {
								name: optionDisplayName,
							})}
						>
							<ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
						</button>
						<button
							ref={(el) => registerMoveButtonRef(option.id, "down", el)}
							type="button"
							disabled={index === total - 1}
							onClick={() => onMoveOption(index, "down")}
							className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
							aria-label={t("configModal.moveChecklistItemDown", {
								name: optionDisplayName,
							})}
							title={t("configModal.moveChecklistItemDown", {
								name: optionDisplayName,
							})}
						>
							<ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
						</button>
					</div>
				)}
				<button
					type="button"
					onClick={() => onRemoveOption(fieldIndex, option.id)}
					className="p-1 text-xs text-rose-500 hover:text-rose-600 font-bold ml-1 cursor-pointer"
					title={t("configModal.removeItem")}
				>
					×
				</button>
			</div>
		</div>
	);
};

interface SortableChecklistPresetOptionsListProps {
	options: CustomFieldOption[];
	fieldIndex: number;
	onOptionValueChange: (
		fieldIndex: number,
		optionId: string,
		newValue: string,
	) => void;
	onOptionColorChange: (
		fieldIndex: number,
		optionId: string,
		color: string,
	) => void;
	onRemoveOption: (fieldIndex: number, optionId: string) => void;
	onReorderOptions: (
		fieldIndex: number,
		nextOptions: CustomFieldOption[],
	) => void;
	onDragStateChange: (isDragging: boolean) => void;
	onAnnounce: (message: string) => void;
}

const SortableChecklistPresetOptionsList: React.FC<
	SortableChecklistPresetOptionsListProps
> = ({
	options,
	fieldIndex,
	onOptionValueChange,
	onOptionColorChange,
	onRemoveOption,
	onReorderOptions,
	onDragStateChange,
	onAnnounce,
}) => {
	const { t } = useI18n();
	const isDraggingRef = useRef(false);
	const onDragStateChangeRef = useRef(onDragStateChange);
	onDragStateChangeRef.current = onDragStateChange;
	const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const moveButtonRefs = useRef<
		Map<
			string,
			{ up?: HTMLButtonElement | null; down?: HTMLButtonElement | null }
		>
	>(new Map());

	const optionSensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	useEffect(() => {
		return () => {
			if (isDraggingRef.current) {
				isDraggingRef.current = false;
				onDragStateChangeRef.current(false);
				document.documentElement.classList.remove("is-dragging-item");
			}
		};
	}, []);

	const registerItemRef = useCallback(
		(optionId: string, el: HTMLDivElement | null) => {
			if (el) {
				itemRefs.current.set(optionId, el);
			} else {
				itemRefs.current.delete(optionId);
			}
		},
		[],
	);

	const registerMoveButtonRef = useCallback(
		(optionId: string, dir: "up" | "down", el: HTMLButtonElement | null) => {
			const entry = moveButtonRefs.current.get(optionId) || {};
			entry[dir] = el;
			if (!entry.up && !entry.down) {
				moveButtonRefs.current.delete(optionId);
			} else {
				moveButtonRefs.current.set(optionId, entry);
			}
		},
		[],
	);

	const getOptionDisplayName = (opt: CustomFieldOption, index: number) =>
		opt.value.trim() ||
		t("taskModal.checklistItemFallbackName", { index: index + 1 });

	const handleMoveOption = (index: number, direction: "up" | "down") => {
		const delta = direction === "up" ? -1 : 1;
		const reordered = moveItemByOffset(options, index, delta);
		if (reordered === options) return;

		const targetIndex = index + delta;
		const movedOption = reordered[targetIndex];
		onReorderOptions(fieldIndex, reordered);
		onAnnounce(
			t("configModal.checklistItemMovedAnnouncement", {
				name: getOptionDisplayName(movedOption, targetIndex),
				position: targetIndex + 1,
				total: reordered.length,
			}),
		);

		requestAnimationFrame(() => {
			const itemEl = itemRefs.current.get(movedOption.id);
			itemEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
			const buttons = moveButtonRefs.current.get(movedOption.id);
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
		onDragStateChange(true);
		document.documentElement.classList.add("is-dragging-item");
	};

	const handleDragEnd = (event: DragEndEvent) => {
		isDraggingRef.current = false;
		onDragStateChange(false);
		document.documentElement.classList.remove("is-dragging-item");

		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const reordered = reorderItemsById(
			options,
			String(active.id),
			String(over.id),
		);
		if (reordered === options) return;

		const newIndex = reordered.findIndex((o) => o.id === String(active.id));
		onReorderOptions(fieldIndex, reordered);
		if (newIndex !== -1) {
			const movedOption = reordered[newIndex];
			onAnnounce(
				t("configModal.checklistItemMovedAnnouncement", {
					name: getOptionDisplayName(movedOption, newIndex),
					position: newIndex + 1,
					total: reordered.length,
				}),
			);
			requestAnimationFrame(() => {
				itemRefs.current
					.get(movedOption.id)
					?.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		}
	};

	const handleDragCancel = (event: DragCancelEvent) => {
		isDraggingRef.current = false;
		onDragStateChange(false);
		document.documentElement.classList.remove("is-dragging-item");

		const activeIndex = options.findIndex(
			(o) => o.id === String(event.active.id),
		);
		if (activeIndex !== -1) {
			const activeOption = options[activeIndex];
			onAnnounce(
				t("configModal.checklistItemMoveCancelled", {
					name: getOptionDisplayName(activeOption, activeIndex),
				}),
			);
			requestAnimationFrame(() => {
				itemRefs.current
					.get(activeOption.id)
					?.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		}
	};

	return (
		<DndContext
			sensors={optionSensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext
				items={options.map((opt) => opt.id)}
				strategy={verticalListSortingStrategy}
			>
				{options.map((opt, idx) => (
					<SortableChecklistPresetOption
						key={opt.id}
						option={opt}
						index={idx}
						total={options.length}
						fieldIndex={fieldIndex}
						onOptionValueChange={onOptionValueChange}
						onOptionColorChange={onOptionColorChange}
						onRemoveOption={onRemoveOption}
						onMoveOption={handleMoveOption}
						registerItemRef={registerItemRef}
						registerMoveButtonRef={registerMoveButtonRef}
					/>
				))}
			</SortableContext>
		</DndContext>
	);
};

interface SortableCustomFieldCardProps {
	field: CustomFieldDef;
	index: number;
	total: number;
	onMove: (index: number, direction: "up" | "down") => void;
	onNameChange: (index: number, newName: string) => void;
	onDelete: (index: number) => void;
	onOptionValueChange: (
		fieldIndex: number,
		optionId: string,
		newValue: string,
	) => void;
	onOptionColorChange: (
		fieldIndex: number,
		optionId: string,
		color: string,
	) => void;
	onRemoveOption: (fieldIndex: number, optionId: string) => void;
	onAddOption: (fieldIndex: number, optionValue: string) => void;
	onReorderOptions: (
		fieldIndex: number,
		nextOptions: CustomFieldOption[],
	) => void;
	onOptionDragStateChange: (isDragging: boolean) => void;
	onAnnounceOptionMove: (message: string) => void;
	registerItemRef: (fieldId: string, el: HTMLDivElement | null) => void;
	registerMoveButtonRef: (
		fieldId: string,
		dir: "up" | "down",
		el: HTMLButtonElement | null,
	) => void;
}

const SortableCustomFieldCard: React.FC<SortableCustomFieldCardProps> = ({
	field,
	index,
	total,
	onMove,
	onNameChange,
	onDelete,
	onOptionValueChange,
	onOptionColorChange,
	onRemoveOption,
	onAddOption,
	onReorderOptions,
	onOptionDragStateChange,
	onAnnounceOptionMove,
	registerItemRef,
	registerMoveButtonRef,
}) => {
	const { t } = useI18n();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: field.id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const setCombinedRef = useCallback(
		(node: HTMLDivElement | null) => {
			setNodeRef(node);
			registerItemRef(field.id, node);
		},
		[field.id, registerItemRef, setNodeRef],
	);

	const fieldDisplayName = field.name || field.id;

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
			className={`sortable-field-item p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] space-y-3 shadow-xs transition-shadow ${
				isDragging ? "relative z-50 ring-2 ring-blue-500 shadow-xl" : ""
			}`}
		>
			{/* Header with Drag Handle, Field Name Input, Type, Reorder Buttons, and Delete Button */}
			<div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-2.5 gap-2">
				<div className="flex items-center space-x-2 flex-1 min-w-0">
					<button
						type="button"
						{...attributes}
						{...listeners}
						className="drag-handle cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] focus-visible:bg-[var(--bg-surface)] p-1 rounded transition-colors shrink-0"
						aria-label={t("configModal.dragToReorderField", {
							name: fieldDisplayName,
						})}
						title={t("configModal.dragToReorderField", {
							name: fieldDisplayName,
						})}
					>
						<GripVertical className="w-4 h-4" />
					</button>
					<input
						type="text"
						value={field.name}
						onChange={(e) => onNameChange(index, e.target.value)}
						className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2.5 py-1 text-sm font-bold text-[var(--text-primary)] flex-1 min-w-0 outline-none"
						placeholder={t("configModal.fieldTitle")}
					/>
					<span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
						{t(getCustomFieldTypeKey(field.type))}
					</span>
				</div>

				<div className="flex items-center space-x-1.5 shrink-0">
					<button
						ref={(el) => registerMoveButtonRef(field.id, "up", el)}
						type="button"
						disabled={index === 0}
						onClick={() => onMove(index, "up")}
						className="p-1.5 text-xs bg-[var(--bg-surface)] hover:opacity-80 disabled:opacity-30 border border-[var(--border-color)] rounded text-[var(--text-primary)] transition-colors cursor-pointer disabled:cursor-not-allowed"
						aria-label={t("configModal.moveFieldUp", {
							name: fieldDisplayName,
						})}
						title={t("configModal.moveFieldUp", {
							name: fieldDisplayName,
						})}
					>
						▲
					</button>
					<button
						ref={(el) => registerMoveButtonRef(field.id, "down", el)}
						type="button"
						disabled={index === total - 1}
						onClick={() => onMove(index, "down")}
						className="p-1.5 text-xs bg-[var(--bg-surface)] hover:opacity-80 disabled:opacity-30 border border-[var(--border-color)] rounded text-[var(--text-primary)] transition-colors cursor-pointer disabled:cursor-not-allowed"
						aria-label={t("configModal.moveFieldDown", {
							name: fieldDisplayName,
						})}
						title={t("configModal.moveFieldDown", {
							name: fieldDisplayName,
						})}
					>
						▼
					</button>

					{/* Explicit FIELD DELETE Button */}
					<button
						type="button"
						onClick={() => onDelete(index)}
						className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-500 font-bold transition-all shadow-2xs cursor-pointer shrink-0"
						title={t("configModal.deleteFieldTooltip")}
					>
						<Trash2 className="w-3.5 h-3.5" />
						<span>{t("configModal.deleteField")}</span>
					</button>
				</div>
			</div>

			{/* Options List with color picker and individual Option Delete buttons for dropdown and checklist */}
			{(field.type === "dropdown" || field.type === "checklist") && (
				<div className="space-y-2 pt-1">
					<span className="text-[11px] font-semibold text-[var(--text-secondary)] block">
						{field.type === "checklist"
							? t("configModal.checklistItems")
							: t("configModal.dropdownOptions")}
					</span>
					<div className="space-y-2">
						{field.options && field.options.length > 0 ? (
							field.type === "checklist" ? (
								<SortableChecklistPresetOptionsList
									options={field.options}
									fieldIndex={index}
									onOptionValueChange={onOptionValueChange}
									onOptionColorChange={onOptionColorChange}
									onRemoveOption={onRemoveOption}
									onReorderOptions={onReorderOptions}
									onDragStateChange={onOptionDragStateChange}
									onAnnounce={onAnnounceOptionMove}
								/>
							) : (
								field.options.map((opt) => (
									<div
										key={opt.id}
										className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] gap-2"
									>
										<div className="flex items-center space-x-2 flex-1 min-w-0">
											<span
												className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
												style={{
													backgroundColor: opt.color || "#3b82f6",
												}}
											/>
											<input
												type="text"
												value={opt.value}
												onChange={(e) =>
													onOptionValueChange(index, opt.id, e.target.value)
												}
												className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2 py-0.5 text-xs font-medium text-[var(--text-primary)] flex-1 min-w-0 outline-none"
											/>
										</div>

										{/* Color Swatch Picker */}
										<div className="flex items-center space-x-1 justify-end shrink-0">
											{COLOR_PRESETS.map((colorHex) => (
												<button
													key={colorHex}
													type="button"
													onClick={() =>
														onOptionColorChange(index, opt.id, colorHex)
													}
													className={`w-4 h-4 rounded-full transition-transform ${
														opt.color === colorHex
															? "scale-125 ring-2 ring-white/60 shadow-md"
															: "hover:scale-110 opacity-70 hover:opacity-100"
													}`}
													style={{ backgroundColor: colorHex }}
												/>
											))}
											<button
												type="button"
												onClick={() => onRemoveOption(index, opt.id)}
												className="p-1 text-xs text-rose-500 hover:text-rose-600 font-bold ml-1"
												title={t("configModal.removeItem")}
											>
												×
											</button>
										</div>
									</div>
								))
							)
						) : (
							<span className="text-xs text-[var(--text-muted)] italic">
								{field.type === "checklist"
									? t("configModal.noChecklistItems")
									: t("configModal.noDropdownOptions")}
							</span>
						)}
					</div>

					<button
						type="button"
						onClick={() => {
							const val = prompt(
								field.type === "checklist"
									? t("configModal.promptNewChecklistItem")
									: t("configModal.promptNewOption"),
							);
							if (val?.trim()) {
								onAddOption(index, val.trim());
							}
						}}
						className="mt-2 px-3 py-1 bg-[var(--bg-surface)] hover:opacity-80 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors"
					>
						{field.type === "checklist"
							? t("configModal.addChecklistItemButton")
							: t("configModal.addOptionButton")}
					</button>
				</div>
			)}
		</div>
	);
};

interface ColumnManagerModalProps {
	isOpen: boolean;
	onClose: () => void;
	columns: Column[];
	customFields?: CustomFieldDef[];
	onSaveConfig: (
		newColumns: Column[],
		newCustomFields?: CustomFieldDef[],
	) => Promise<void>;
}

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
	isOpen,
	onClose,
	columns,
	customFields = [],
	onSaveConfig,
}) => {
	const { t } = useI18n();
	const [activeTab, setActiveTab] = useState<"columns" | "customFields">(
		"columns",
	);

	const [localColumns, setLocalColumns] = useState<Column[]>(() =>
		columns.map((col, idx) => ({
			...col,
			name: col.name || (col as unknown as { title?: string }).title || "",
			visible: col.visible !== false,
			order: col.order ?? idx + 1,
		})),
	);
	const [localCustomFields, setLocalCustomFields] = useState<CustomFieldDef[]>(
		() =>
			ensureUniqueIds(customFields || [], "cf").map((field) =>
				field.options
					? { ...field, options: ensureUniqueIds(field.options, "opt") }
					: field,
			),
	);

	const [newColumnName, setNewColumnName] = useState("");

	// New Custom Field state
	const [newFieldName, setNewFieldName] = useState("");
	const [newFieldType, setNewFieldType] = useState<CustomFieldType>("dropdown");
	const [newFieldOptionsInput, setNewFieldOptionsInput] = useState("");

	const [isSaving, setIsSaving] = useState(false);
	const [isMaximized, setIsMaximized] = useState(false);
	const [liveAnnouncement, setLiveAnnouncement] = useState("");

	const isDraggingFieldRef = useRef(false);
	const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fieldItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const fieldMoveButtonRefs = useRef<
		Map<
			string,
			{ up?: HTMLButtonElement | null; down?: HTMLButtonElement | null }
		>
	>(new Map());

	const fieldSensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const registerFieldItemRef = useCallback(
		(fieldId: string, el: HTMLDivElement | null) => {
			if (el) {
				fieldItemRefs.current.set(fieldId, el);
			} else {
				fieldItemRefs.current.delete(fieldId);
			}
		},
		[],
	);

	const registerFieldMoveButtonRef = useCallback(
		(fieldId: string, dir: "up" | "down", el: HTMLButtonElement | null) => {
			const entry = fieldMoveButtonRefs.current.get(fieldId) || {};
			entry[dir] = el;
			if (!entry.up && !entry.down) {
				fieldMoveButtonRefs.current.delete(fieldId);
			} else {
				fieldMoveButtonRefs.current.set(fieldId, entry);
			}
		},
		[],
	);

	const announceMessage = useCallback((message: string) => {
		if (announceTimerRef.current) {
			clearTimeout(announceTimerRef.current);
		}
		setLiveAnnouncement("");
		announceTimerRef.current = setTimeout(() => {
			setLiveAnnouncement(message);
		}, 500);
	}, []);

	const announceFieldMove = useCallback(
		(fieldName: string, newIndex: number, total: number) => {
			announceMessage(
				t("configModal.fieldMovedAnnouncement", {
					name: fieldName,
					position: newIndex + 1,
					total,
				}),
			);
		},
		[announceMessage, t],
	);

	useEffect(() => {
		return () => {
			document.documentElement.classList.remove("is-dragging-item");
			if (announceTimerRef.current) {
				clearTimeout(announceTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (isDraggingFieldRef.current) return;
				onClose();
			}
		};

		if (isOpen) {
			window.addEventListener("keydown", handleKeyDown);
		}

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	// --- Custom Field Actions ---
	const handleMoveCustomField = (index: number, direction: "up" | "down") => {
		const delta = direction === "up" ? -1 : 1;
		const reordered = moveItemByOffset(localCustomFields, index, delta);
		if (reordered === localCustomFields) return;

		const targetIndex = index + delta;
		const movedField = reordered[targetIndex];
		setLocalCustomFields(reordered);
		announceFieldMove(
			movedField.name || movedField.id,
			targetIndex,
			reordered.length,
		);

		requestAnimationFrame(() => {
			const itemEl = fieldItemRefs.current.get(movedField.id);
			itemEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
			const buttons = fieldMoveButtonRefs.current.get(movedField.id);
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

	const handleFieldDragStart = () => {
		isDraggingFieldRef.current = true;
		document.documentElement.classList.add("is-dragging-item");
	};

	const handleFieldDragEnd = (event: DragEndEvent) => {
		isDraggingFieldRef.current = false;
		document.documentElement.classList.remove("is-dragging-item");

		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const reordered = reorderItemsById(
			localCustomFields,
			String(active.id),
			String(over.id),
		);
		if (reordered === localCustomFields) return;

		const newIndex = reordered.findIndex((f) => f.id === String(active.id));
		setLocalCustomFields(reordered);
		if (newIndex !== -1) {
			const movedField = reordered[newIndex];
			announceFieldMove(
				movedField.name || movedField.id,
				newIndex,
				reordered.length,
			);
			requestAnimationFrame(() => {
				fieldItemRefs.current
					.get(movedField.id)
					?.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		}
	};

	const handleFieldDragCancel = () => {
		isDraggingFieldRef.current = false;
		document.documentElement.classList.remove("is-dragging-item");
	};
	const createUniqueId = (prefix: string): string =>
		`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

	const parseOptionsInput = (
		type: CustomFieldType,
		rawInput: string,
	): CustomFieldOption[] | undefined => {
		if (type !== "dropdown" && type !== "checklist") return undefined;
		const optionValues = rawInput
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		return optionValues.map((val, idx) => ({
			id: `${createUniqueId("opt")}-${idx}`,
			value: val,
			color: COLOR_PRESETS[idx % COLOR_PRESETS.length],
		}));
	};

	const handleAddCustomField = () => {
		if (!newFieldName.trim()) return;

		const options = parseOptionsInput(newFieldType, newFieldOptionsInput);

		const newField: CustomFieldDef = {
			id: createUniqueId("cf"),
			name: newFieldName.trim(),
			type: newFieldType,
			options,
		};

		setLocalCustomFields([...localCustomFields, newField]);
		setNewFieldName("");
		setNewFieldOptionsInput("");
		setNewFieldType("dropdown");
	};

	const handleDeleteCustomField = (index: number) => {
		const target = localCustomFields[index];
		if (confirm(t("configModal.deleteFieldConfirm", { name: target.name }))) {
			setLocalCustomFields(localCustomFields.filter((_, i) => i !== index));
		}
	};

	const handleFieldNameChange = (fieldIndex: number, newName: string) => {
		setLocalCustomFields((prev) =>
			prev.map((field, idx) =>
				idx === fieldIndex ? { ...field, name: newName } : field,
			),
		);
	};

	const handleRemoveOptionFromCustomField = (
		fieldIndex: number,
		optionId: string,
	) => {
		setLocalCustomFields((prev) =>
			prev.map((field, idx) =>
				idx === fieldIndex && field.options
					? {
							...field,
							options: field.options.filter((opt) => opt.id !== optionId),
						}
					: field,
			),
		);
	};

	const handleOptionColorChange = (
		fieldIndex: number,
		optionId: string,
		color: string,
	) => {
		setLocalCustomFields((prev) =>
			prev.map((field, idx) =>
				idx === fieldIndex && field.options
					? {
							...field,
							options: field.options.map((opt) =>
								opt.id === optionId ? { ...opt, color } : opt,
							),
						}
					: field,
			),
		);
	};

	const handleOptionValueChange = (
		fieldIndex: number,
		optionId: string,
		newValue: string,
	) => {
		setLocalCustomFields((prev) =>
			prev.map((field, idx) =>
				idx === fieldIndex && field.options
					? {
							...field,
							options: field.options.map((opt) =>
								opt.id === optionId ? { ...opt, value: newValue } : opt,
							),
						}
					: field,
			),
		);
	};

	const handleAddOptionToField = (fieldIndex: number, optionValue: string) => {
		const trimmed = optionValue.trim();
		if (!trimmed) return;
		setLocalCustomFields((prev) =>
			prev.map((field, idx) => {
				if (idx !== fieldIndex) return field;
				const currentOptions = field.options || [];
				const color =
					COLOR_PRESETS[currentOptions.length % COLOR_PRESETS.length];
				return {
					...field,
					options: [
						...currentOptions,
						{
							id: createUniqueId("opt"),
							value: trimmed,
							color,
						},
					],
				};
			}),
		);
	};

	const handleReorderOptions = (
		fieldIndex: number,
		nextOptions: CustomFieldOption[],
	) => {
		setLocalCustomFields((prev) =>
			prev.map((field, idx) =>
				idx === fieldIndex ? { ...field, options: nextOptions } : field,
			),
		);
	};

	// --- Column Actions ---
	const handleMoveColumn = (index: number, direction: "up" | "down") => {
		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= localColumns.length) return;

		const updated = [...localColumns];
		const [moved] = updated.splice(index, 1);
		updated.splice(targetIndex, 0, moved);

		const reordered = updated.map((col, idx) => ({ ...col, order: idx + 1 }));
		setLocalColumns(reordered);
	};

	const handleToggleVisibility = (index: number) => {
		const updated = [...localColumns];
		updated[index] = { ...updated[index], visible: !updated[index].visible };
		setLocalColumns(updated);
	};

	const handleDeleteColumn = (index: number) => {
		if (localColumns.length <= 1) {
			alert(t("configModal.atLeastOneColumn"));
			return;
		}
		const colToDelete = localColumns[index];
		if (
			confirm(t("configModal.deleteColumnConfirm", { name: colToDelete.name }))
		) {
			const updated = localColumns.filter((_, i) => i !== index);
			const reordered = updated.map((col, idx) => ({ ...col, order: idx + 1 }));
			setLocalColumns(reordered);
		}
	};

	const handleColumnNameChange = (index: number, newName: string) => {
		const updated = [...localColumns];
		updated[index] = { ...updated[index], name: newName };
		setLocalColumns(updated);
	};

	const handleColumnColorChange = (index: number, color: string) => {
		const updated = [...localColumns];
		updated[index] = { ...updated[index], color };
		setLocalColumns(updated);
	};

	const handleAddColumn = () => {
		if (!newColumnName.trim()) return;
		const name = newColumnName.trim();
		const id = createUniqueId("col");
		const color = COLOR_PRESETS[localColumns.length % COLOR_PRESETS.length];
		const newCol: Column = {
			id,
			name,
			color,
			visible: true,
			order: localColumns.length + 1,
		};
		setLocalColumns([...localColumns, newCol]);
		setNewColumnName("");
	};

	const handleSave = async () => {
		setIsSaving(true);
		try {
			const finalCustomFields = [...localCustomFields];
			if (newFieldName.trim()) {
				const pendingField: CustomFieldDef = {
					id: createUniqueId("cf"),
					name: newFieldName.trim(),
					type: newFieldType,
					options: parseOptionsInput(newFieldType, newFieldOptionsInput),
				};
				finalCustomFields.push(pendingField);
			}

			await onSaveConfig(localColumns, finalCustomFields);
			onClose();
		} catch (err) {
			console.error("Failed to save config:", err);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-3 animate-fade-in">
			<div
				className={`bg-[var(--modal-bg)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full overflow-hidden flex flex-col transition-all duration-300 ${
					isMaximized
						? "w-[98vw] h-[96vh] max-w-none max-h-none"
						: "max-w-3xl h-[90vh]"
				}`}
			>
				{/* Modal Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
					<h2 className="text-lg font-semibold flex items-center space-x-2">
						<span>⚙️</span>
						<span>{t("configModal.title")}</span>
					</h2>
					<div className="flex items-center space-x-1">
						<button
							type="button"
							onClick={() => setIsMaximized(!isMaximized)}
							className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
							title={isMaximized ? t("modal.minimize") : t("modal.maximize")}
						>
							{isMaximized ? (
								<Minimize2 className="w-5 h-5" />
							) : (
								<Maximize2 className="w-5 h-5" />
							)}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>

				{/* Tab Header */}
				<div className="flex border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-6 pt-3 space-x-4">
					<button
						type="button"
						onClick={() => setActiveTab("columns")}
						className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
							activeTab === "columns"
								? "border-blue-500 text-blue-500"
								: "border-transparent text-[var(--text-secondary)] hover:opacity-80"
						}`}
					>
						📋 {t("configModal.tabColumns")}
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("customFields")}
						className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center space-x-1.5 ${
							activeTab === "customFields"
								? "border-blue-500 text-blue-500"
								: "border-transparent text-[var(--text-secondary)] hover:opacity-80"
						}`}
					>
						<span>🎛️</span>
						<span>{t("configModal.tabCustomFields")}</span>
					</button>
				</div>

				{/* Modal Body */}
				<div className="p-6 space-y-6 overflow-y-auto flex-1">
					{activeTab === "columns" ? (
						/* Columns Tab */
						<div className="space-y-4">
							<p className="text-xs text-[var(--text-secondary)]">
								{t("configModal.columnsDesc")}
							</p>

							<div className="space-y-3">
								{localColumns.map((col, idx) => (
									<div
										key={col.id}
										className={`flex flex-col p-3 rounded-lg border gap-2.5 transition-all ${
											col.visible !== false
												? "border-[var(--border-color)] bg-[var(--bg-card)]"
												: "border-[var(--border-color)] opacity-60"
										}`}
									>
										<div className="flex items-center justify-between gap-3">
											{/* Title & Color Input */}
											<div className="flex items-center space-x-2 flex-1">
												<label
													className="relative flex items-center cursor-pointer group"
													title={t("configModal.selectCustomColor")}
												>
													<span
														className="w-5 h-5 rounded-full border border-white/20 shrink-0 shadow-xs group-hover:scale-110 transition-transform"
														style={{ backgroundColor: col.color || "#3b82f6" }}
													/>
													<input
														type="color"
														value={col.color || "#3b82f6"}
														onChange={(e) =>
															handleColumnColorChange(idx, e.target.value)
														}
														className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
													/>
												</label>
												<input
													type="text"
													value={col.name}
													onChange={(e) =>
														handleColumnNameChange(idx, e.target.value)
													}
													className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2.5 py-1 text-sm font-medium text-[var(--text-primary)] flex-1 outline-none"
												/>
											</div>

											{/* Actions: Move Up, Move Down, Toggle Visibility, Delete */}
											<div className="flex items-center space-x-1.5 justify-end">
												<button
													type="button"
													disabled={idx === 0}
													onClick={() => handleMoveColumn(idx, "up")}
													className="p-1.5 text-xs bg-[var(--bg-card)] hover:opacity-80 disabled:opacity-30 border border-[var(--border-color)] rounded text-[var(--text-primary)] transition-colors"
													title={t("configModal.moveColumnUp")}
												>
													▲
												</button>
												<button
													type="button"
													disabled={idx === localColumns.length - 1}
													onClick={() => handleMoveColumn(idx, "down")}
													className="p-1.5 text-xs bg-[var(--bg-card)] hover:opacity-80 disabled:opacity-30 border border-[var(--border-color)] rounded text-[var(--text-primary)] transition-colors"
													title={t("configModal.moveColumnDown")}
												>
													▼
												</button>
												<button
													type="button"
													onClick={() => handleToggleVisibility(idx)}
													className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
														col.visible !== false
															? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
															: "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]"
													}`}
												>
													{col.visible !== false
														? t("configModal.visible")
														: t("configModal.hidden")}
												</button>
												<button
													type="button"
													onClick={() => handleDeleteColumn(idx)}
													className="p-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-rose-500 transition-colors"
													title={t("configModal.deleteColumn")}
												>
													🗑️
												</button>
											</div>
										</div>

										{/* Extended Color Preset Palette */}
										<div className="flex items-center space-x-1.5 flex-wrap pt-1 pl-7">
											<span className="text-[11px] font-medium text-[var(--text-muted)] mr-1">
												{t("configModal.colorLabel")}
											</span>
											{COLOR_PRESETS.map((colorHex) => (
												<button
													key={colorHex}
													type="button"
													onClick={() => handleColumnColorChange(idx, colorHex)}
													className={`w-4 h-4 rounded-full transition-transform ${
														col.color === colorHex
															? "scale-125 ring-2 ring-white/80 shadow-md"
															: "opacity-70 hover:opacity-100 hover:scale-110"
													}`}
													style={{ backgroundColor: colorHex }}
													title={colorHex}
												/>
											))}
										</div>
									</div>
								))}
							</div>

							{/* Add New Column */}
							<div className="pt-4 border-t border-[var(--border-color)]">
								<label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
									{t("configModal.addColumn")}
								</label>
								<div className="flex space-x-2">
									<input
										type="text"
										placeholder={t("configModal.columnNamePlaceholder")}
										value={newColumnName}
										onChange={(e) => setNewColumnName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.nativeEvent.isComposing) {
												handleAddColumn();
											}
										}}
										className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
									/>
									<button
										type="button"
										onClick={handleAddColumn}
										className="inline-flex items-center space-x-1 shrink-0 px-4 py-2 bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors"
									>
										<Plus className="w-4 h-4" />
										<span>{t("configModal.add")}</span>
									</button>
								</div>
							</div>
						</div>
					) : (
						/* Custom Fields Tab */
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
									<Sliders className="w-4 h-4 text-blue-500" />
									<span>
										{t("configModal.configuredCustomFields", {
											count: localCustomFields.length,
										})}
									</span>
								</h3>
							</div>

							{/* List of custom fields */}
							<div className="sr-only" aria-live="polite" aria-atomic="true">
								{liveAnnouncement}
							</div>
							<DndContext
								sensors={fieldSensors}
								collisionDetection={closestCenter}
								onDragStart={handleFieldDragStart}
								onDragEnd={handleFieldDragEnd}
								onDragCancel={handleFieldDragCancel}
							>
								<SortableContext
									items={localCustomFields.map((f) => f.id)}
									strategy={verticalListSortingStrategy}
								>
									<div className="space-y-3">
										{localCustomFields.map((field, idx) => (
											<SortableCustomFieldCard
												key={field.id}
												field={field}
												index={idx}
												total={localCustomFields.length}
												onMove={handleMoveCustomField}
												onNameChange={handleFieldNameChange}
												onDelete={handleDeleteCustomField}
												onOptionValueChange={handleOptionValueChange}
												onOptionColorChange={handleOptionColorChange}
												onRemoveOption={handleRemoveOptionFromCustomField}
												onAddOption={handleAddOptionToField}
												onReorderOptions={handleReorderOptions}
												onOptionDragStateChange={(isDragging) => {
													isDraggingFieldRef.current = isDragging;
												}}
												onAnnounceOptionMove={announceMessage}
												registerItemRef={registerFieldItemRef}
												registerMoveButtonRef={registerFieldMoveButtonRef}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>

							{/* Create Custom Field Form */}
							<div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)]/80 space-y-3">
								<h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center space-x-1.5">
									<Plus className="w-3.5 h-3.5 text-blue-500" />
									<span>{t("configModal.addCustomField")}</span>
								</h4>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<div>
										<label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
											{t("configModal.fieldTitle")}
										</label>
										<input
											type="text"
											placeholder={t("configModal.fieldNamePlaceholder")}
											value={newFieldName}
											onChange={(e) => setNewFieldName(e.target.value)}
											className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
										/>
									</div>

									<div>
										<label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
											{t("configModal.fieldType")}
										</label>
										<select
											value={newFieldType}
											onChange={(e) =>
												setNewFieldType(e.target.value as CustomFieldType)
											}
											className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
										>
											<option value="dropdown">
												{t("configModal.typeDropdown")}
											</option>
											<option value="checklist">
												{t("configModal.typeChecklist") || "チェックリスト"}
											</option>
											<option value="text">{t("configModal.typeText")}</option>
											<option value="number">
												{t("configModal.typeNumber")}
											</option>
											<option value="date">{t("configModal.typeDate")}</option>
											<option value="checkbox">
												{t("configModal.typeCheckbox")}
											</option>
											<option value="link">{t("configModal.typeLink")}</option>
										</select>
									</div>
								</div>

								{(newFieldType === "dropdown" ||
									newFieldType === "checklist") && (
									<div>
										<label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
											{newFieldType === "checklist"
												? t("configModal.checklistItemsPlaceholder") ||
													"デフォルト項目（カンマ区切り）"
												: `${t("configModal.addOption")} (${t("configModal.optionPlaceholder")})`}
										</label>
										<input
											type="text"
											placeholder={
												newFieldType === "checklist"
													? t("configModal.checklistItemsPlaceholder") ||
														"例: 要件定義, 実装, テスト"
													: t("configModal.optionPlaceholder")
											}
											value={newFieldOptionsInput}
											onChange={(e) => setNewFieldOptionsInput(e.target.value)}
											className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
										/>
									</div>
								)}

								<div className="flex justify-end pt-1">
									<button
										type="button"
										onClick={handleAddCustomField}
										disabled={!newFieldName.trim()}
										className="inline-flex items-center space-x-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors"
									>
										<Plus className="w-3.5 h-3.5" />
										<span>{t("configModal.add")}</span>
									</button>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Modal Footer */}
				<div className="flex items-center justify-end px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)] space-x-2">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 bg-[var(--bg-card)] hover:opacity-80 text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg text-sm font-medium transition-colors"
					>
						{t("configModal.cancel")}
					</button>
					<button
						type="button"
						disabled={isSaving}
						onClick={handleSave}
						className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
					>
						{isSaving ? t("configModal.saving") : t("configModal.save")}
					</button>
				</div>
			</div>
		</div>
	);
};
