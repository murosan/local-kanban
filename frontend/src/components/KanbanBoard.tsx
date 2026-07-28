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
import { Column, CustomFieldDef, Task } from '../types/task';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { updateTask } from '../services/api';
import { useI18n } from '../i18n/I18nContext';

interface KanbanBoardProps {
  columns: Column[];
  customFields?: CustomFieldDef[];
  tasks: Task[];
  onTaskUpdated: () => void;
  onCardClick: (task: Task) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns,
  customFields = [],
  tasks,
  onTaskUpdated,
  onCardClick,
}) => {
  const { t } = useI18n();
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

    // Determine target column
    let targetColumnId: string | undefined;

    const matchingColumn = columns.find((col) => col.id === overId);
    if (matchingColumn) {
      targetColumnId = matchingColumn.id;
    } else {
      const overTaskItem = findTask(overId);
      if (overTaskItem) {
        targetColumnId = overTaskItem.column_id;
      }
    }

    if (!targetColumnId) return;

    // Get ordered tasks in target column
    const targetTasks = tasks.filter((t) => {
      if (t.id === activeId) return false;
      return t.column_id === targetColumnId;
    });

    // Find position where active item was dropped
    let prevId = '';
    let nextId = '';

    if (matchingColumn) {
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
        column_id: targetColumnId,
        prev_id: prevId,
        next_id: nextId,
      });
      onTaskUpdated();
    } catch (err) {
      console.error('Failed to move task:', err);
    }
  };

  const visibleColumns = columns
    .filter((col) => col.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (visibleColumns.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] border border-dashed border-slate-700/80 rounded-2xl p-8 text-center text-slate-400">
        <p className="text-sm">{t('board.noColumns')}</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex space-x-4 overflow-x-auto pb-8 pt-1 items-start min-h-[calc(100vh-120px)] w-full px-1">
        {visibleColumns.map((column) => {
          const colTasks = tasks.filter((t) => t.column_id === column.id);
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              customFields={customFields}
              tasks={colTasks}
              onCardClick={onCardClick}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 scale-105 shadow-2xl">
            <TaskCard task={activeTask} customFields={customFields} isOverlay />
          </div>
        ) : null}

      </DragOverlay>
    </DndContext>
  );
};
