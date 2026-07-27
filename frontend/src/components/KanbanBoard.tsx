import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { Column, Task, TaskStatus } from '../types/task';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { updateTask } from '../services/api';

interface KanbanBoardProps {
  columns: Column[];
  tasks: Task[];
  onTaskUpdated: () => void;
  onCardClick: (task: Task) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns,
  tasks,
  onTaskUpdated,
  onCardClick,
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Requires 5px drag to start preventing accidental triggers
      },
    })
  );

  const findTask = (id: string) => tasks.find((t) => t.id === id);

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(event.active.id as string);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTaskItem = findTask(activeId);
    if (!activeTaskItem) return;

    // Determine target status
    let targetStatus: TaskStatus = activeTaskItem.status;
    const isOverColumn = columns.some((col) => col.status === overId);
    
    if (isOverColumn) {
      targetStatus = overId as TaskStatus;
    } else {
      const overTaskItem = findTask(overId);
      if (overTaskItem) {
        targetStatus = overTaskItem.status;
      }
    }

    // Get ordered tasks in target column
    const targetTasks = tasks.filter(
      (t) => t.status === targetStatus && t.id !== activeId
    );

    // Find position where active item was dropped
    let prevId = '';
    let nextId = '';

    if (isOverColumn) {
      // Dropped at end of column
      if (targetTasks.length > 0) {
        prevId = targetTasks[targetTasks.length - 1].id;
      }
    } else {
      const overIndex = targetTasks.findIndex((t) => t.id === overId);
      if (overIndex >= 0) {
        if (overIndex > 0) {
          prevId = targetTasks[overIndex - 1].id;
        }
        nextId = targetTasks[overIndex].id;
      }
    }

    try {
      await updateTask(activeId, {
        status: targetStatus,
        prev_id: prevId,
        next_id: nextId,
      });
      onTaskUpdated();
    } catch (err) {
      console.error('Failed to move task:', err);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex space-x-6 overflow-x-auto pb-8 pt-2 items-start min-h-[calc(100vh-140px)]">
        {columns.map((column) => {
          const colTasks = tasks.filter((t) => t.status === column.status);
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={colTasks}
              onCardClick={onCardClick}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 scale-105 shadow-2xl">
            <TaskCard task={activeTask} onCardClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
