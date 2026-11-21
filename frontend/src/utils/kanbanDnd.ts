import type { Column, Task } from "../types/task";

export interface TaskPosition {
	columnId: string;
	index: number;
	prevId: string;
	nextId: string;
}

export function findColumnIdForItem(
	itemId: string,
	tasks: Task[],
	columns: Column[],
): string | undefined {
	if (columns.some((col) => col.id === itemId)) {
		return itemId;
	}
	return tasks.find((t) => t.id === itemId)?.column_id;
}

export function getTaskPosition(
	tasks: Task[],
	taskId: string,
): TaskPosition | null {
	const task = tasks.find((t) => t.id === taskId);
	if (!task?.column_id) {
		return null;
	}

	const colTasks = tasks.filter((t) => t.column_id === task.column_id);
	const index = colTasks.findIndex((t) => t.id === taskId);
	if (index === -1) {
		return null;
	}

	return {
		columnId: task.column_id,
		index,
		prevId: index > 0 ? colTasks[index - 1].id : "",
		nextId: index < colTasks.length - 1 ? colTasks[index + 1].id : "",
	};
}

export function hasTaskPositionChanged(
	initialPos: TaskPosition | null,
	finalPos: TaskPosition | null,
): boolean {
	if (!finalPos) {
		return false;
	}
	if (!initialPos) {
		return true;
	}
	return (
		initialPos.columnId !== finalPos.columnId ||
		initialPos.prevId !== finalPos.prevId ||
		initialPos.nextId !== finalPos.nextId
	);
}

export function moveTaskInList(
	tasks: Task[],
	activeId: string,
	targetColumnId: string,
	targetIndexInColumn: number,
): Task[] {
	const activeIndex = tasks.findIndex((t) => t.id === activeId);
	if (activeIndex === -1) {
		return tasks;
	}

	const currentTask = tasks[activeIndex];
	const currentColTasks = tasks.filter((t) => t.column_id === targetColumnId);

	const withoutActive = tasks.filter((t) => t.id !== activeId);
	const targetColTasks = withoutActive.filter(
		(t) => t.column_id === targetColumnId,
	);
	const clampedIndex = Math.max(
		0,
		Math.min(targetIndexInColumn, targetColTasks.length),
	);

	if (currentTask.column_id === targetColumnId) {
		const currentIndexInCol = currentColTasks.findIndex(
			(t) => t.id === activeId,
		);
		if (currentIndexInCol === clampedIndex) {
			return tasks;
		}
	}

	const movedTask: Task = {
		...currentTask,
		column_id: targetColumnId,
	};

	if (targetColTasks.length === 0) {
		return [...withoutActive, movedTask];
	}

	const result = [...withoutActive];
	if (clampedIndex < targetColTasks.length) {
		const nextTask = targetColTasks[clampedIndex];
		const insertAt = result.findIndex((t) => t.id === nextTask.id);
		if (insertAt !== -1) {
			result.splice(insertAt, 0, movedTask);
			return result;
		}
	} else {
		const prevTask = targetColTasks[targetColTasks.length - 1];
		const prevAt = result.findIndex((t) => t.id === prevTask.id);
		if (prevAt !== -1) {
			result.splice(prevAt + 1, 0, movedTask);
			return result;
		}
	}

	result.push(movedTask);
	return result;
}

export interface CrossColumnInsertParams {
	overId: string;
	overColumnTasks: Task[];
	isOverColumnContainer: boolean;
	isBelowOverItem: boolean;
	isAboveColumnItems?: boolean;
}

export function resolveCrossColumnInsertIndex({
	overId,
	overColumnTasks,
	isOverColumnContainer,
	isBelowOverItem,
	isAboveColumnItems = false,
}: CrossColumnInsertParams): number {
	if (isOverColumnContainer) {
		if (overColumnTasks.length === 0 || isAboveColumnItems) {
			return 0;
		}
		return overColumnTasks.length;
	}

	const overIndex = overColumnTasks.findIndex((t) => t.id === overId);
	if (overIndex === -1) {
		return overColumnTasks.length;
	}

	return isBelowOverItem ? overIndex + 1 : overIndex;
}
