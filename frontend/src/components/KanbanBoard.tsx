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
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { updateTask } from "../services/api";
import type {
	Column,
	ColumnSettings,
	CustomFieldDef,
	Task,
} from "../types/task";
import { isColumnCardDetailsVisible } from "../utils/columnSettings";
import {
	findColumnIdForItem,
	getTaskPosition,
	hasTaskPositionChanged,
	moveTaskInList,
	resolveCrossColumnInsertIndex,
	type TaskPosition,
} from "../utils/kanbanDnd";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
	columns: Column[];
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
}

const MEASURING_CONFIG = {
	droppable: {
		strategy: MeasuringStrategy.Always,
	},
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
	columns,
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
}) => {
	const { t } = useI18n();
	const [activeTask, setActiveTask] = useState<Task | null>(null);
	const [dragTasks, setDragTasks] = useState<Task[] | null>(null);
	const dragTasksRef = useRef<Task[] | null>(null);
	const initialPositionRef = useRef<TaskPosition | null>(null);
	const recentlyMovedToNewContainerRef = useRef(false);

	const displayTasks = dragTasks ?? tasks;
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
		setActiveTask(null);
		setDragTasks(null);
		dragTasksRef.current = null;
		initialPositionRef.current = null;
		recentlyMovedToNewContainerRef.current = false;
	}, []);

	const collisionDetectionStrategy: CollisionDetection = useCallback(
		(args) => {
			const pointerIntersections = pointerWithin(args);
			const isPointerHit = pointerIntersections.length > 0;
			const intersections = isPointerHit
				? pointerIntersections
				: rectIntersection(args);

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
								...args,
								droppableContainers: args.droppableContainers.filter(
									(container) => taskIds.has(String(container.id)),
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
		const activeId = String(event.active.id);
		const task = tasks.find((item) => item.id === activeId);
		if (task) {
			setActiveTask(task);
			const snapshot = [...tasks];
			dragTasksRef.current = snapshot;
			setDragTasks(snapshot);
			initialPositionRef.current = getTaskPosition(tasks, activeId);
			recentlyMovedToNewContainerRef.current = false;
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
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

	const visibleColumns = columns
		.filter((col) => col.visible !== false)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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

	if (visibleColumns.length === 0) {
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
			<div className="flex space-x-4 overflow-x-auto pb-2 pt-1 items-start h-full w-full px-1">
				{visibleColumns.map((column) => {
					const colTasks = displayTasks.filter(
						(task) => task.column_id === column.id,
					);
					const isDropTarget = Boolean(
						activeTask &&
							currentActiveColumnId === column.id &&
							activeTask.column_id !== column.id,
					);
					return (
						<KanbanColumn
							key={column.id}
							column={column}
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
						/>
					);
				})}
			</div>

			<DragOverlay dropAnimation={null}>
				{activeTask ? (
					<div className="rotate-2 scale-105 shadow-2xl">
						<TaskCard
							task={activeTask}
							customFields={customFields}
							showCardDetails={showOverlayCardDetails}
							isOverlay
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
};
