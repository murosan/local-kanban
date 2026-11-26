import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	Archive,
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Columns2,
	EyeOff,
	GripVertical,
	Layers,
	MoreHorizontal,
	Plus,
	Search,
} from "lucide-react";
import type React from "react";
import { useI18n } from "../i18n/useI18n";
import type {
	Column,
	ColumnSettings,
	CustomFieldDef,
	Task,
} from "../types/task";
import {
	isColumnCardDetailsVisible,
	isColumnCardsVisible,
	isTemporarilyExpandedBySearch,
	shouldRenderColumnCards,
} from "../utils/columnSettings";
import { ActionMenu, type ActionMenuGroup } from "./ActionMenu";
import { TaskCard } from "./TaskCard";

export interface ColumnDragHandleProps {
	attributes: React.HTMLAttributes<HTMLButtonElement>;
	listeners?: Record<string, unknown>;
	label: string;
}

interface KanbanColumnProps {
	column: Column;
	customFields?: CustomFieldDef[];
	tasks: Task[];
	isDropTarget?: boolean;
	hasActiveSearch?: boolean;
	isStacked?: boolean;
	isDraggingColumn?: boolean;
	dragHandleProps?: ColumnDragHandleProps;
	canMoveLeft?: boolean;
	canMoveRight?: boolean;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
	canStackLeft?: boolean;
	canStackRight?: boolean;
	canUnstack?: boolean;
	onCardClick: (task: Task) => void;
	onSubtaskToggle?: (subtask: Task) => void;
	onAddSubtask?: (parentId: string, title: string) => Promise<void> | void;
	onChecklistItemToggle?: (
		task: Task,
		fieldId: string,
		itemId: string,
	) => Promise<void> | void;
	onDuplicateTask?: (task: Task) => Promise<Task | null>;
	onAddCard?: (columnId: string) => void;
	onUpdateColumnSettings?: (
		columnId: string,
		patch: Partial<ColumnSettings>,
	) => Promise<void> | void;
	onMoveLeft?: () => void;
	onMoveRight?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	onStackLeft?: () => void;
	onStackRight?: () => void;
	onUnstack?: () => void;
	onArchiveColumn?: (columnId: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
	column,
	customFields = [],
	tasks,
	isDropTarget = false,
	hasActiveSearch = false,
	isStacked = false,
	isDraggingColumn = false,
	dragHandleProps,
	canMoveLeft = false,
	canMoveRight = false,
	canMoveUp = false,
	canMoveDown = false,
	canStackLeft = false,
	canStackRight = false,
	canUnstack = false,
	onCardClick,
	onSubtaskToggle,
	onAddSubtask,
	onChecklistItemToggle,
	onDuplicateTask,
	onAddCard,
	onUpdateColumnSettings,
	onMoveLeft,
	onMoveRight,
	onMoveUp,
	onMoveDown,
	onStackLeft,
	onStackRight,
	onUnstack,
	onArchiveColumn,
}) => {
	const { t } = useI18n();
	const columnDropId = column.id;
	const { setNodeRef, isOver } = useDroppable({
		id: columnDropId,
		data: {
			type: "column-drop",
			columnId: column.id,
		},
	});

	const taskIds = tasks.map((t) => t.id);
	const columnAccentColor = column.color || "#3b82f6";
	const isHighlighted = isOver || isDropTarget;

	const showCardsSetting = isColumnCardsVisible(column);
	const showCardDetails = isColumnCardDetailsVisible(column);
	const shouldShowCards = shouldRenderColumnCards(column, {
		hasActiveSearch,
		matchedTaskCount: tasks.length,
	});
	const expandedBySearch = isTemporarilyExpandedBySearch(column, {
		hasActiveSearch,
		matchedTaskCount: tasks.length,
	});

	const menuGroups: ActionMenuGroup[] = [];

	if (onUpdateColumnSettings) {
		menuGroups.push({
			id: "column-display-settings",
			items: [
				{
					id: "show-cards",
					label: t("column.showCards"),
					checked: showCardsSetting,
					onSelect: () =>
						onUpdateColumnSettings(column.id, {
							show_cards: !showCardsSetting,
						}),
				},
				{
					id: "show-card-details",
					label: t("column.showCardDetails"),
					checked: showCardDetails,
					onSelect: () =>
						onUpdateColumnSettings(column.id, {
							show_card_details: !showCardDetails,
						}),
				},
			],
		});
	}

	const orderItems: ActionMenuGroup["items"] = [];
	if (isStacked) {
		if (onMoveUp) {
			orderItems.push({
				id: "move-up",
				label: t("column.moveUp"),
				icon: <ArrowUp className="w-3.5 h-3.5" />,
				disabled: !canMoveUp,
				onSelect: onMoveUp,
			});
		}
		if (onMoveDown) {
			orderItems.push({
				id: "move-down",
				label: t("column.moveDown"),
				icon: <ArrowDown className="w-3.5 h-3.5" />,
				disabled: !canMoveDown,
				onSelect: onMoveDown,
			});
		}
		if (onMoveLeft) {
			orderItems.push({
				id: "move-lane-left",
				label: t("column.moveLaneLeft"),
				icon: <ArrowLeft className="w-3.5 h-3.5" />,
				disabled: !canMoveLeft,
				onSelect: onMoveLeft,
			});
		}
		if (onMoveRight) {
			orderItems.push({
				id: "move-lane-right",
				label: t("column.moveLaneRight"),
				icon: <ArrowRight className="w-3.5 h-3.5" />,
				disabled: !canMoveRight,
				onSelect: onMoveRight,
			});
		}
	} else {
		if (onMoveLeft) {
			orderItems.push({
				id: "move-left",
				label: t("column.moveLeft"),
				icon: <ArrowLeft className="w-3.5 h-3.5" />,
				disabled: !canMoveLeft,
				onSelect: onMoveLeft,
			});
		}
		if (onMoveRight) {
			orderItems.push({
				id: "move-right",
				label: t("column.moveRight"),
				icon: <ArrowRight className="w-3.5 h-3.5" />,
				disabled: !canMoveRight,
				onSelect: onMoveRight,
			});
		}
	}
	if (orderItems.length > 0) {
		menuGroups.push({
			id: "column-layout-order",
			items: orderItems,
		});
	}

	const stackItems: ActionMenuGroup["items"] = [];
	if (isStacked) {
		if (onUnstack) {
			stackItems.push({
				id: "unstack",
				label: t("column.unstack"),
				icon: <Columns2 className="w-3.5 h-3.5" />,
				disabled: !canUnstack,
				onSelect: onUnstack,
			});
		}
	} else {
		if (onStackLeft) {
			stackItems.push({
				id: "stack-left",
				label: t("column.stackLeft"),
				icon: <Layers className="w-3.5 h-3.5" />,
				disabled: !canStackLeft,
				onSelect: onStackLeft,
			});
		}
		if (onStackRight) {
			stackItems.push({
				id: "stack-right",
				label: t("column.stackRight"),
				icon: <Layers className="w-3.5 h-3.5" />,
				disabled: !canStackRight,
				onSelect: onStackRight,
			});
		}
	}
	if (stackItems.length > 0) {
		menuGroups.push({
			id: "column-stack-actions",
			items: stackItems,
		});
	}

	if (onArchiveColumn) {
		menuGroups.push({
			id: "column-archive-actions",
			items: [
				{
					id: "archive-column",
					label: t("column.archive"),
					icon: <Archive className="w-3.5 h-3.5" />,
					onSelect: () => onArchiveColumn(column.id),
				},
			],
		});
	}

	const sizingClasses = isStacked
		? shouldShowCards
			? "w-full max-h-full min-h-0"
			: "w-full flex-none"
		: "w-80 flex-shrink-0 max-h-full";

	return (
		<div
			ref={setNodeRef}
			style={{ borderTopColor: columnAccentColor }}
			className={`flex flex-col ${sizingClasses} glass-panel rounded-2xl border-t-2 ${
				isHighlighted ? "ring-2 ring-blue-500/50 opacity-90" : ""
			} ${isDraggingColumn ? "opacity-40 ring-2 ring-blue-500/40" : ""} transition-all duration-200`}
		>
			{/* Column Header */}
			<div
				className={`flex items-center justify-between gap-2 px-3.5 py-2 ${
					shouldShowCards ? "border-b border-[var(--border-color)]" : ""
				}`}
			>
				<div className="flex items-center space-x-2 min-w-0">
					{dragHandleProps && (
						<button
							type="button"
							{...dragHandleProps.attributes}
							{...dragHandleProps.listeners}
							className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] p-0.5 -ml-1.5 rounded transition-colors shrink-0"
							aria-label={dragHandleProps.label}
							title={dragHandleProps.label}
						>
							<GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
						</button>
					)}
					<span
						className="w-3 h-3 rounded-full shrink-0"
						style={{ backgroundColor: columnAccentColor }}
					/>
					<h2 className="font-bold text-[var(--text-primary)] text-sm truncate">
						{column.name}
					</h2>
					<span
						className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0"
						style={{
							backgroundColor: `${columnAccentColor}20`,
							color: columnAccentColor,
							borderColor: `${columnAccentColor}40`,
						}}
					>
						{tasks.length}
					</span>
					{!showCardsSetting && (
						<span
							className="inline-flex items-center text-[var(--text-muted)] shrink-0"
							title={t("column.cardsHiddenBadge")}
						>
							<EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
							<span className="sr-only">{t("column.cardsHiddenBadge")}</span>
						</span>
					)}
				</div>

				{/* Header Actions */}
				<div className="flex items-center space-x-0.5 shrink-0">
					<button
						type="button"
						onClick={() => onAddCard?.(column.id)}
						className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-color)] transition-all active:scale-95"
						title={t("column.addCardTooltip")}
						aria-label={t("column.addCard")}
					>
						<Plus className="w-4 h-4" />
					</button>
					{menuGroups.length > 0 && (
						<ActionMenu
							triggerLabel={t("column.settingsMenu")}
							triggerIcon={<MoreHorizontal className="w-4 h-4" />}
							triggerClassName="border border-transparent hover:border-[var(--border-color)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] hover:opacity-100"
							popoverClassName="min-w-[14rem]"
							groups={menuGroups}
						/>
					)}
				</div>
			</div>

			{/* Task Cards Container */}
			{shouldShowCards && (
				<div
					className={`flex-1 p-3 ${
						showCardDetails ? "space-y-3" : "space-y-2"
					} overflow-y-auto min-h-0`}
				>
					{expandedBySearch && (
						<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] font-medium text-blue-500">
							<Search className="w-3 h-3 shrink-0" aria-hidden="true" />
							<span className="truncate">
								{t("column.showingSearchResults")}
							</span>
						</div>
					)}

					<SortableContext
						items={taskIds}
						strategy={verticalListSortingStrategy}
					>
						{tasks.map((task) => (
							<TaskCard
								key={task.id}
								task={task}
								customFields={customFields}
								showCardDetails={showCardDetails}
								onCardClick={onCardClick}
								onSubtaskToggle={onSubtaskToggle}
								onAddSubtask={onAddSubtask}
								onChecklistItemToggle={onChecklistItemToggle}
								onDuplicate={onDuplicateTask}
							/>
						))}
					</SortableContext>

					{tasks.length === 0 && (
						<div
							className={`flex items-center justify-center ${
								isStacked ? "h-20" : "h-32"
							} border-2 border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)] text-xs font-medium`}
						>
							{t("column.dropHere")}
						</div>
					)}
				</div>
			)}
		</div>
	);
};
