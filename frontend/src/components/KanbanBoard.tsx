import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	getFirstCollision,
	MeasuringStrategy,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	type UniqueIdentifier,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { updateTask } from "../services/api";
import type {
	BoardLane,
	Column,
	ColumnSettings,
	CustomFieldDef,
	Task,
} from "../types/task";
import {
	getVisibleBoardLanes,
	type ResolvedBoardLane,
} from "../utils/boardLayout";
import {
	isColumnCardDetailsVisible,
	shouldRenderColumnCards,
} from "../utils/columnSettings";
import {
	findColumnIdForItem,
	getTaskPosition,
	hasTaskPositionChanged,
	moveTaskInList,
	resolveCrossColumnInsertIndex,
	type TaskPosition,
} from "../utils/kanbanDnd";
import { prefersReducedMotion } from "../utils/reorder";
import { type ColumnDragHandleProps, KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

const LANE_DRAG_PREFIX = "lane-drag:";
const STACKED_COL_DRAG_PREFIX = "col-drag:";

const toLaneDragId = (laneId: string): string => `${LANE_DRAG_PREFIX}${laneId}`;
const toStackedColDragId = (columnId: string): string =>
	`${STACKED_COL_DRAG_PREFIX}${columnId}`;

type ActiveDragItem =
	| { type: "task"; task: Task }
	| { type: "lane"; lane: ResolvedBoardLane }
	| { type: "stacked-column"; column: Column; laneId: string };

interface KanbanBoardProps {
	columns: Column[];
	lanes?: BoardLane[];
	customFields?: CustomFieldDef[];
	tasks: Task[];
	hasActiveSearch?: boolean;
	onTaskUpdated: () => void;
	onTasksChange?: (tasks: Task[]) => void;
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
	onMoveLane?: (laneId: string, direction: "left" | "right") => void;
	onReorderLanes?: (activeLaneId: string, overLaneId: string) => void;
	onMoveColumnInLane?: (columnId: string, direction: "up" | "down") => void;
	onReorderColumnInLane?: (
		laneId: string,
		activeColumnId: string,
		overColumnId: string,
	) => void;
	onStackColumn?: (columnId: string, direction: "left" | "right") => void;
	onUnstackColumn?: (columnId: string) => void;
	onArchiveColumn?: (columnId: string) => void;
}

interface SortableStackedColumnItemProps {
	laneId: string;
	column: Column;
	colIndex: number;
	totalInLane: number;
	expandedCountInLane: number;
	canMoveLaneLeft: boolean;
	canMoveLaneRight: boolean;
	customFields: CustomFieldDef[];
	tasks: Task[];
	isDropTarget: boolean;
	hasActiveSearch: boolean;
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
	onMoveLaneLeft?: () => void;
	onMoveLaneRight?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	onUnstack?: () => void;
	onArchiveColumn?: (columnId: string) => void;
}

const SortableStackedColumnItem: React.FC<SortableStackedColumnItemProps> = ({
	laneId,
	column,
	colIndex,
	totalInLane,
	expandedCountInLane,
	canMoveLaneLeft,
	canMoveLaneRight,
	customFields,
	tasks,
	isDropTarget,
	hasActiveSearch,
	onCardClick,
	onSubtaskToggle,
	onAddSubtask,
	onChecklistItemToggle,
	onDuplicateTask,
	onAddCard,
	onUpdateColumnSettings,
	onMoveLaneLeft,
	onMoveLaneRight,
	onMoveUp,
	onMoveDown,
	onUnstack,
	onArchiveColumn,
}) => {
	const { t } = useI18n();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: toStackedColDragId(column.id),
		data: {
			type: "stacked-column",
			columnId: column.id,
			laneId,
		},
	});

	const shouldShowCards = shouldRenderColumnCards(column, {
		hasActiveSearch,
		matchedTaskCount: tasks.length,
	});

	const wrapperSizing = shouldShowCards
		? expandedCountInLane <= 1
			? "flex-initial min-h-0 flex flex-col"
			: "flex-initial min-h-[180px] flex flex-col"
		: "flex-none flex flex-col";

	const style: React.CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const dragHandleProps: ColumnDragHandleProps = {
		attributes,
		listeners: listeners as Record<string, unknown> | undefined,
		label: t("column.dragToReorder", { name: column.name }),
	};

	return (
		<div ref={setNodeRef} style={style} className={wrapperSizing}>
			<KanbanColumn
				column={column}
				customFields={customFields}
				tasks={tasks}
				isDropTarget={isDropTarget}
				hasActiveSearch={hasActiveSearch}
				isStacked
				isDraggingColumn={isDragging}
				dragHandleProps={dragHandleProps}
				canMoveLeft={canMoveLaneLeft}
				canMoveRight={canMoveLaneRight}
				canMoveUp={colIndex > 0}
				canMoveDown={colIndex < totalInLane - 1}
				canUnstack={totalInLane > 1}
				onCardClick={onCardClick}
				onSubtaskToggle={onSubtaskToggle}
				onAddSubtask={onAddSubtask}
				onChecklistItemToggle={onChecklistItemToggle}
				onDuplicateTask={onDuplicateTask}
				onAddCard={onAddCard}
				onUpdateColumnSettings={onUpdateColumnSettings}
				onMoveLeft={onMoveLaneLeft}
				onMoveRight={onMoveLaneRight}
				onMoveUp={onMoveUp}
				onMoveDown={onMoveDown}
				onUnstack={onUnstack}
				onArchiveColumn={onArchiveColumn}
			/>
		</div>
	);
};

interface SortableLaneItemProps {
	lane: ResolvedBoardLane;
	laneIndex: number;
	totalLanes: number;
	customFields: CustomFieldDef[];
	displayTasks: Task[];
	activeTask: Task | null;
	currentActiveColumnId?: string;
	hasActiveSearch: boolean;
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
	onMoveLane?: (laneId: string, direction: "left" | "right") => void;
	onMoveColumnInLane?: (columnId: string, direction: "up" | "down") => void;
	onStackColumn?: (columnId: string, direction: "left" | "right") => void;
	onUnstackColumn?: (columnId: string) => void;
	onArchiveColumn?: (columnId: string) => void;
}

const SortableLaneItem: React.FC<SortableLaneItemProps> = ({
	lane,
	laneIndex,
	totalLanes,
	customFields,
	displayTasks,
	activeTask,
	currentActiveColumnId,
	hasActiveSearch,
	onCardClick,
	onSubtaskToggle,
	onAddSubtask,
	onChecklistItemToggle,
	onDuplicateTask,
	onAddCard,
	onUpdateColumnSettings,
	onMoveLane,
	onMoveColumnInLane,
	onStackColumn,
	onUnstackColumn,
	onArchiveColumn,
}) => {
	const { t } = useI18n();
	const isReorderable = totalLanes > 1;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: toLaneDragId(lane.id),
		disabled: !isReorderable,
		data: {
			type: "lane",
			laneId: lane.id,
		},
	});

	const style: React.CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition: prefersReducedMotion() ? undefined : transition,
	};

	const canMoveLeft = laneIndex > 0;
	const canMoveRight = laneIndex < totalLanes - 1;
	const isStacked = lane.columns.length > 1;

	if (!isStacked) {
		const column = lane.columns[0];
		const colTasks = displayTasks.filter(
			(task) => task.column_id === column.id,
		);
		const isDropTarget = Boolean(
			activeTask &&
				currentActiveColumnId === column.id &&
				activeTask.column_id !== column.id,
		);
		const dragHandleProps: ColumnDragHandleProps | undefined = isReorderable
			? {
					attributes,
					listeners: listeners as Record<string, unknown> | undefined,
					label: t("column.dragToReorder", { name: column.name }),
				}
			: undefined;

		return (
			<div
				ref={setNodeRef}
				style={style}
				className="w-80 flex-shrink-0 flex flex-col h-full min-h-0"
			>
				<KanbanColumn
					column={column}
					customFields={customFields}
					tasks={colTasks}
					isDropTarget={isDropTarget}
					hasActiveSearch={hasActiveSearch}
					isDraggingColumn={isDragging}
					dragHandleProps={dragHandleProps}
					canMoveLeft={canMoveLeft}
					canMoveRight={canMoveRight}
					canStackLeft={canMoveLeft}
					canStackRight={canMoveRight}
					onCardClick={onCardClick}
					onSubtaskToggle={onSubtaskToggle}
					onAddSubtask={onAddSubtask}
					onChecklistItemToggle={onChecklistItemToggle}
					onDuplicateTask={onDuplicateTask}
					onAddCard={onAddCard}
					onUpdateColumnSettings={onUpdateColumnSettings}
					onMoveLeft={
						onMoveLane ? () => onMoveLane(lane.id, "left") : undefined
					}
					onMoveRight={
						onMoveLane ? () => onMoveLane(lane.id, "right") : undefined
					}
					onStackLeft={
						onStackColumn ? () => onStackColumn(column.id, "left") : undefined
					}
					onStackRight={
						onStackColumn ? () => onStackColumn(column.id, "right") : undefined
					}
					onArchiveColumn={onArchiveColumn}
				/>
			</div>
		);
	}

	const columnTasksMap = new Map<string, Task[]>();
	let expandedCountInLane = 0;
	for (const column of lane.columns) {
		const colTasks = displayTasks.filter(
			(task) => task.column_id === column.id,
		);
		columnTasksMap.set(column.id, colTasks);
		if (
			shouldRenderColumnCards(column, {
				hasActiveSearch,
				matchedTaskCount: colTasks.length,
			})
		) {
			expandedCountInLane += 1;
		}
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`w-80 flex-shrink-0 flex flex-col gap-2.5 h-full min-h-0 ${
				isDragging ? "opacity-40" : ""
			}`}
		>
			{isReorderable && (
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="h-5 w-full flex items-center justify-center rounded-lg border border-dashed border-[var(--border-color)]/80 bg-[var(--bg-surface)]/40 hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing shrink-0 transition-colors"
					aria-label={t("column.dragLaneToReorder")}
					title={t("column.dragLaneToReorder")}
				>
					<GripHorizontal className="w-4 h-4" aria-hidden="true" />
				</button>
			)}

			<div className="flex-1 flex flex-col gap-2.5 min-h-0 overflow-y-auto">
				<SortableContext
					items={lane.columns.map((col) => toStackedColDragId(col.id))}
					strategy={verticalListSortingStrategy}
				>
					{lane.columns.map((column, colIndex) => {
						const colTasks = columnTasksMap.get(column.id) ?? [];
						const isDropTarget = Boolean(
							activeTask &&
								currentActiveColumnId === column.id &&
								activeTask.column_id !== column.id,
						);
						return (
							<SortableStackedColumnItem
								key={column.id}
								laneId={lane.id}
								column={column}
								colIndex={colIndex}
								totalInLane={lane.columns.length}
								expandedCountInLane={expandedCountInLane}
								canMoveLaneLeft={canMoveLeft}
								canMoveLaneRight={canMoveRight}
								customFields={customFields}
								tasks={colTasks}
								isDropTarget={isDropTarget}
								hasActiveSearch={hasActiveSearch}
								onCardClick={onCardClick}
								onSubtaskToggle={onSubtaskToggle}
								onAddSubtask={onAddSubtask}
								onChecklistItemToggle={onChecklistItemToggle}
								onDuplicateTask={onDuplicateTask}
								onAddCard={onAddCard}
								onUpdateColumnSettings={onUpdateColumnSettings}
								onMoveLaneLeft={
									onMoveLane ? () => onMoveLane(lane.id, "left") : undefined
								}
								onMoveLaneRight={
									onMoveLane ? () => onMoveLane(lane.id, "right") : undefined
								}
								onMoveUp={
									onMoveColumnInLane
										? () => onMoveColumnInLane(column.id, "up")
										: undefined
								}
								onMoveDown={
									onMoveColumnInLane
										? () => onMoveColumnInLane(column.id, "down")
										: undefined
								}
								onUnstack={
									onUnstackColumn ? () => onUnstackColumn(column.id) : undefined
								}
								onArchiveColumn={onArchiveColumn}
							/>
						);
					})}
				</SortableContext>
			</div>
		</div>
	);
};

const MEASURING_CONFIG = {
	droppable: {
		strategy: MeasuringStrategy.Always,
	},
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
	columns,
	lanes,
	customFields = [],
	tasks,
	hasActiveSearch = false,
	onTaskUpdated,
	onTasksChange,
	onCardClick,
	onSubtaskToggle,
	onAddSubtask,
	onChecklistItemToggle,
	onDuplicateTask,
	onAddCard,
	onUpdateColumnSettings,
	onMoveLane,
	onReorderLanes,
	onMoveColumnInLane,
	onReorderColumnInLane,
	onStackColumn,
	onUnstackColumn,
	onArchiveColumn,
}) => {
	const { t } = useI18n();
	const [activeDrag, setActiveDrag] = useState<ActiveDragItem | null>(null);
	const [dragTasks, setDragTasks] = useState<Task[] | null>(null);
	const dragTasksRef = useRef<Task[] | null>(null);
	const initialPositionRef = useRef<TaskPosition | null>(null);
	const recentlyMovedToNewContainerRef = useRef(false);

	const activeTask = activeDrag?.type === "task" ? activeDrag.task : null;
	const displayTasks = dragTasks ?? tasks;

	const visibleLanes = useMemo(
		() => getVisibleBoardLanes(columns, lanes),
		[columns, lanes],
	);

	const visibleColumns = useMemo(
		() => visibleLanes.flatMap((lane) => lane.columns),
		[visibleLanes],
	);

	const columnIds = useMemo(
		() => new Set(columns.map((col) => col.id)),
		[columns],
	);

	useEffect(() => {
		if (!dragTasks) return;
		const frameId = requestAnimationFrame(() => {
			recentlyMovedToNewContainerRef.current = false;
		});
		return () => cancelAnimationFrame(frameId);
	}, [dragTasks]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5, // Requires 5px drag to start preventing accidental triggers
			},
		}),
	);

	const resetDragState = useCallback(() => {
		setActiveDrag(null);
		setDragTasks(null);
		dragTasksRef.current = null;
		initialPositionRef.current = null;
		recentlyMovedToNewContainerRef.current = false;
	}, []);

	const collisionDetectionStrategy: CollisionDetection = useCallback(
		(args) => {
			const activeType = args.active.data.current?.type;

			if (activeType === "lane") {
				return closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(container) => container.data.current?.type === "lane",
					),
				});
			}

			if (activeType === "stacked-column") {
				const activeLaneId = args.active.data.current?.laneId;
				return closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(container) =>
							container.data.current?.type === "stacked-column" &&
							container.data.current?.laneId === activeLaneId,
					),
				});
			}

			// Task dragging: ignore lane and stacked-column sortables
			const taskDroppables = args.droppableContainers.filter((container) => {
				const type = container.data.current?.type;
				return type !== "lane" && type !== "stacked-column";
			});
			const taskArgs = { ...args, droppableContainers: taskDroppables };

			const pointerIntersections = pointerWithin(taskArgs);
			const isPointerHit = pointerIntersections.length > 0;
			const intersections = isPointerHit
				? pointerIntersections
				: rectIntersection(taskArgs);

			if (intersections.length > 0) {
				let overId: UniqueIdentifier | null = null;

				if (isPointerHit) {
					const directTaskHit = intersections.find(
						(collision) => !columnIds.has(String(collision.id)),
					);
					if (directTaskHit) {
						overId = directTaskHit.id;
					}
				}

				if (overId == null) {
					overId = getFirstCollision(intersections, "id");
				}

				if (overId != null) {
					const overIdStr = String(overId);
					if (columnIds.has(overIdStr)) {
						const currentTasks = dragTasksRef.current ?? tasks;
						const containerTasks = currentTasks.filter(
							(task) => task.column_id === overIdStr,
						);

						if (containerTasks.length > 0) {
							const taskIds = new Set(containerTasks.map((task) => task.id));
							const closestInColumn = closestCenter({
								...taskArgs,
								droppableContainers: taskDroppables.filter((container) =>
									taskIds.has(String(container.id)),
								),
							});
							if (closestInColumn.length > 0) {
								overId = closestInColumn[0].id;
							}
						}
					}

					return [{ id: overId }];
				}
			}

			if (recentlyMovedToNewContainerRef.current) {
				return [{ id: args.active.id }];
			}

			return [];
		},
		[columnIds, tasks],
	);

	const moveAcrossColumn = (
		currentTasks: Task[],
		active: DragOverEvent["active"],
		over: NonNullable<DragOverEvent["over"]>,
		overColumnId: string,
	): Task[] => {
		const activeId = String(active.id);
		const overId = String(over.id);
		const overColumnTasks = currentTasks.filter(
			(task) => task.column_id === overColumnId && task.id !== activeId,
		);
		const isOverColumnContainer = columnIds.has(overId);
		const activeRect = active.rect.current.translated;
		const isBelowOverItem = Boolean(
			activeRect &&
				activeRect.top + activeRect.height / 2 >
					over.rect.top + over.rect.height / 2,
		);
		const isAboveColumnItems = Boolean(
			isOverColumnContainer &&
				activeRect &&
				activeRect.top + activeRect.height / 2 < over.rect.top + 64,
		);

		const insertIndex = resolveCrossColumnInsertIndex({
			overId,
			overColumnTasks,
			isOverColumnContainer,
			isBelowOverItem,
			isAboveColumnItems,
		});

		return moveTaskInList(currentTasks, activeId, overColumnId, insertIndex);
	};

	const handleDragStart = (event: DragStartEvent) => {
		const activeType = event.active.data.current?.type;
		if (activeType === "lane") {
			const laneId = String(event.active.data.current?.laneId ?? "");
			const lane = visibleLanes.find((l) => l.id === laneId);
			if (lane) {
				setActiveDrag({ type: "lane", lane });
			}
			return;
		}
		if (activeType === "stacked-column") {
			const columnId = String(event.active.data.current?.columnId ?? "");
			const laneId = String(event.active.data.current?.laneId ?? "");
			const col = visibleColumns.find((c) => c.id === columnId);
			if (col) {
				setActiveDrag({ type: "stacked-column", column: col, laneId });
			}
			return;
		}

		const activeId = String(event.active.id);
		const task = tasks.find((item) => item.id === activeId);
		if (task) {
			setActiveDrag({ type: "task", task });
			const snapshot = [...tasks];
			dragTasksRef.current = snapshot;
			setDragTasks(snapshot);
			initialPositionRef.current = getTaskPosition(tasks, activeId);
			recentlyMovedToNewContainerRef.current = false;
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
		const activeType = active.data.current?.type;
		if (activeType === "lane" || activeType === "stacked-column") {
			return;
		}
		if (!over) return;

		const activeId = String(active.id);
		const overId = String(over.id);
		if (activeId === overId) return;

		const currentTasks = dragTasksRef.current ?? tasks;
		const activeColumnId = findColumnIdForItem(activeId, currentTasks, columns);
		const overColumnId = findColumnIdForItem(overId, currentTasks, columns);

		if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
			return;
		}

		const nextTasks = moveAcrossColumn(
			currentTasks,
			active,
			over,
			overColumnId,
		);
		if (nextTasks !== currentTasks) {
			recentlyMovedToNewContainerRef.current = true;
			dragTasksRef.current = nextTasks;
			setDragTasks(nextTasks);
		}
	};

	const handleDragCancel = () => {
		resetDragState();
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		const activeType = active.data.current?.type;

		if (activeType === "lane") {
			resetDragState();
			if (over?.data.current?.type !== "lane") return;
			const activeLaneId = String(active.data.current?.laneId ?? "");
			const overLaneId = String(over.data.current?.laneId ?? "");
			if (activeLaneId && overLaneId && activeLaneId !== overLaneId) {
				onReorderLanes?.(activeLaneId, overLaneId);
			}
			return;
		}

		if (activeType === "stacked-column") {
			resetDragState();
			if (over?.data.current?.type !== "stacked-column") return;
			const activeLaneId = String(active.data.current?.laneId ?? "");
			const overLaneId = String(over.data.current?.laneId ?? "");
			const activeColumnId = String(active.data.current?.columnId ?? "");
			const overColumnId = String(over.data.current?.columnId ?? "");
			if (
				activeLaneId &&
				activeLaneId === overLaneId &&
				activeColumnId &&
				overColumnId &&
				activeColumnId !== overColumnId
			) {
				onReorderColumnInLane?.(activeLaneId, activeColumnId, overColumnId);
			}
			return;
		}

		const currentTasks = dragTasksRef.current ?? tasks;
		const initialPos = initialPositionRef.current;

		resetDragState();

		if (!over) return;

		const activeId = String(active.id);
		const overId = String(over.id);

		const activeColumnId = findColumnIdForItem(activeId, currentTasks, columns);
		const overColumnId = findColumnIdForItem(overId, currentTasks, columns);
		if (!activeColumnId || !overColumnId) return;

		let finalTasks = currentTasks;

		if (activeColumnId === overColumnId) {
			if (overId !== activeId && !columnIds.has(overId)) {
				const colTasks = currentTasks.filter(
					(task) => task.column_id === activeColumnId,
				);
				const newIndex = colTasks.findIndex((task) => task.id === overId);
				if (newIndex !== -1) {
					finalTasks = moveTaskInList(
						currentTasks,
						activeId,
						activeColumnId,
						newIndex,
					);
				}
			}
		} else {
			finalTasks = moveAcrossColumn(currentTasks, active, over, overColumnId);
		}

		const finalPos = getTaskPosition(finalTasks, activeId);
		if (!finalPos || !hasTaskPositionChanged(initialPos, finalPos)) {
			return;
		}

		// Optimistic UI Update to immediately reflect changes in UI
		if (onTasksChange) {
			onTasksChange(finalTasks);
		}

		try {
			await updateTask(activeId, {
				column_id: finalPos.columnId,
				prev_id: finalPos.prevId,
				next_id: finalPos.nextId,
			});
			onTaskUpdated();
		} catch (err) {
			console.error("Failed to move task:", err);
			onTaskUpdated();
		}
	};

	const currentActiveColumnId = activeTask
		? displayTasks.find((task) => task.id === activeTask.id)?.column_id
		: undefined;
	const activeOverlayColumn = activeTask
		? columns.find(
				(col) => col.id === (currentActiveColumnId ?? activeTask.column_id),
			)
		: undefined;
	const showOverlayCardDetails = activeOverlayColumn
		? isColumnCardDetailsVisible(activeOverlayColumn)
		: true;

	if (visibleLanes.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[50vh] border border-dashed border-slate-700/80 rounded-2xl p-8 text-center text-slate-400">
				<p className="text-sm">{t("board.noColumns")}</p>
			</div>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetectionStrategy}
			measuring={MEASURING_CONFIG}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragCancel={handleDragCancel}
			onDragEnd={handleDragEnd}
		>
			<SortableContext
				items={visibleLanes.map((lane) => toLaneDragId(lane.id))}
				strategy={horizontalListSortingStrategy}
			>
				<div className="flex gap-4 overflow-x-auto pb-2 pt-1 items-stretch h-full w-full px-1">
					{visibleLanes.map((lane, laneIndex) => (
						<SortableLaneItem
							key={lane.id}
							lane={lane}
							laneIndex={laneIndex}
							totalLanes={visibleLanes.length}
							customFields={customFields}
							displayTasks={displayTasks}
							activeTask={activeTask}
							currentActiveColumnId={currentActiveColumnId}
							hasActiveSearch={hasActiveSearch}
							onCardClick={onCardClick}
							onSubtaskToggle={onSubtaskToggle}
							onAddSubtask={onAddSubtask}
							onChecklistItemToggle={onChecklistItemToggle}
							onDuplicateTask={onDuplicateTask}
							onAddCard={onAddCard}
							onUpdateColumnSettings={onUpdateColumnSettings}
							onMoveLane={onMoveLane}
							onMoveColumnInLane={onMoveColumnInLane}
							onStackColumn={onStackColumn}
							onUnstackColumn={onUnstackColumn}
							onArchiveColumn={onArchiveColumn}
						/>
					))}
				</div>
			</SortableContext>

			<DragOverlay dropAnimation={null}>
				{activeDrag?.type === "task" ? (
					<div className="rotate-2 scale-105 shadow-2xl">
						<TaskCard
							task={activeDrag.task}
							customFields={customFields}
							showCardDetails={showOverlayCardDetails}
							isOverlay
						/>
					</div>
				) : activeDrag?.type === "lane" ? (
					<div className="w-80 space-y-2 opacity-95 shadow-2xl">
						{activeDrag.lane.columns.map((col) => {
							const count = displayTasks.filter(
								(task) => task.column_id === col.id,
							).length;
							const accent = col.color || "#3b82f6";
							return (
								<div
									key={col.id}
									style={{ borderTopColor: accent }}
									className="glass-panel rounded-2xl border-t-2 px-3.5 py-2.5 flex items-center justify-between ring-2 ring-blue-500/60"
								>
									<div className="flex items-center space-x-2 min-w-0">
										<span
											className="w-3 h-3 rounded-full shrink-0"
											style={{ backgroundColor: accent }}
										/>
										<span className="font-bold text-[var(--text-primary)] text-sm truncate">
											{col.name}
										</span>
									</div>
									<span
										className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0"
										style={{
											backgroundColor: `${accent}20`,
											color: accent,
											borderColor: `${accent}40`,
										}}
									>
										{count}
									</span>
								</div>
							);
						})}
					</div>
				) : activeDrag?.type === "stacked-column" ? (
					<div
						style={{ borderTopColor: activeDrag.column.color || "#3b82f6" }}
						className="w-80 glass-panel rounded-2xl border-t-2 px-3.5 py-2.5 flex items-center justify-between ring-2 ring-blue-500/60 shadow-2xl opacity-95"
					>
						<div className="flex items-center space-x-2 min-w-0">
							<span
								className="w-3 h-3 rounded-full shrink-0"
								style={{
									backgroundColor: activeDrag.column.color || "#3b82f6",
								}}
							/>
							<span className="font-bold text-[var(--text-primary)] text-sm truncate">
								{activeDrag.column.name}
							</span>
						</div>
						<span
							className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0"
							style={{
								backgroundColor: `${activeDrag.column.color || "#3b82f6"}20`,
								color: activeDrag.column.color || "#3b82f6",
								borderColor: `${activeDrag.column.color || "#3b82f6"}40`,
							}}
						>
							{
								displayTasks.filter(
									(task) => task.column_id === activeDrag.column.id,
								).length
							}
						</span>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
};
