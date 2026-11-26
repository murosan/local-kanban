import { useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { EyeOff, MoreHorizontal, Plus, Search } from "lucide-react";
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
import { ActionMenu } from "./ActionMenu";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
	column: Column;
	customFields?: CustomFieldDef[];
	tasks: Task[];
	isDropTarget?: boolean;
	hasActiveSearch?: boolean;
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
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
	column,
	customFields = [],
	tasks,
	isDropTarget = false,
	hasActiveSearch = false,
	onCardClick,
	onSubtaskToggle,
	onAddSubtask,
	onChecklistItemToggle,
	onDuplicateTask,
	onAddCard,
	onUpdateColumnSettings,
}) => {
	const { t } = useI18n();
	const columnDropId = column.id;
	const { setNodeRef, isOver } = useDroppable({
		id: columnDropId,
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

	return (
		<div
			ref={setNodeRef}
			style={{ borderTopColor: columnAccentColor }}
			className={`flex flex-col w-80 flex-shrink-0 max-h-full glass-panel rounded-2xl border-t-2 ${
				isHighlighted ? "ring-2 ring-blue-500/50 opacity-90" : ""
			} transition-all duration-200`}
		>
			{/* Column Header */}
			<div
				className={`flex items-center justify-between gap-2 px-3.5 py-2 ${
					shouldShowCards ? "border-b border-[var(--border-color)]" : ""
				}`}
			>
				<div className="flex items-center space-x-2 min-w-0">
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
					{onUpdateColumnSettings && (
						<ActionMenu
							triggerLabel={t("column.settingsMenu")}
							triggerIcon={<MoreHorizontal className="w-4 h-4" />}
							triggerClassName="border border-transparent hover:border-[var(--border-color)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] hover:opacity-100"
							popoverClassName="min-w-[14rem]"
							groups={[
								{
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
								},
							]}
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
						<div className="flex items-center justify-center h-32 border-2 border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)] text-xs font-medium">
							{t("column.dropHere")}
						</div>
					)}
				</div>
			)}
		</div>
	);
};
