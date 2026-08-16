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
import { arrayMove } from '@dnd-kit/sortable';
import { Column, CustomFieldDef, Task } from '../types/task';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { updateTask } from '../services/api';
import { useI18n } from '../i18n/useI18n';

interface KanbanBoardProps {
  columns: Column[];
  customFields?: CustomFieldDef[];
  tasks: Task[];
  onTaskUpdated: () => void;
  onTasksChange?: (tasks: Task[]) => void;
  onCardClick: (task: Task) => void;
  onSubtaskToggle?: (subtask: Task) => void;
  onAddSubtask?: (parentId: string, title: string) => Promise<void> | void;
  onAddCard?: (columnId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns,
  customFields = [],
  tasks,
  onTaskUpdated,
  onTasksChange,
  onCardClick,
  onSubtaskToggle,
  onAddSubtask,
  onAddCard,
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

    if (activeId === overId) return;

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

    const targetTasks = tasks.filter((t) => t.column_id === targetColumnId);

    let prevId = '';
    let nextId = '';

    if (matchingColumn) {
      // Dropped onto column container (e.g. empty column or space below tasks)
      const otherTasks = targetTasks.filter((t) => t.id !== activeId);
      if (otherTasks.length > 0) {
        prevId = otherTasks[otherTasks.length - 1].id;
      }
    } else {
      if (activeTaskItem.column_id === targetColumnId) {
        // Reordering within the SAME column
        const oldIndex = targetTasks.findIndex((t) => t.id === activeId);
        const newIndex = targetTasks.findIndex((t) => t.id === overId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(targetTasks, oldIndex, newIndex);
          const activeNewIndex = reordered.findIndex((t) => t.id === activeId);
          if (activeNewIndex > 0) {
            prevId = reordered[activeNewIndex - 1].id;
          }
          if (activeNewIndex < reordered.length - 1) {
            nextId = reordered[activeNewIndex + 1].id;
          }
        }
      } else {
        // Moving to a DIFFERENT column onto a target task
        const overIndex = targetTasks.findIndex((t) => t.id === overId);
        if (overIndex !== -1) {
          if (overIndex > 0) {
            prevId = targetTasks[overIndex - 1].id;
          }
          nextId = targetTasks[overIndex].id;
        }
      }
    }

    // Optimistic UI Update to immediately reflect changes in UI
    if (onTasksChange) {
      const updatedTasks = [...tasks];
      const activeIdx = updatedTasks.findIndex((t) => t.id === activeId);
      if (activeIdx !== -1) {
        const movedTask = { ...updatedTasks[activeIdx], column_id: targetColumnId };
        updatedTasks.splice(activeIdx, 1);

        if (nextId) {
          const nextIdx = updatedTasks.findIndex((t) => t.id === nextId);
          if (nextIdx !== -1) {
            updatedTasks.splice(nextIdx, 0, movedTask);
          } else {
            updatedTasks.push(movedTask);
          }
        } else if (prevId) {
          const prevIdx = updatedTasks.findIndex((t) => t.id === prevId);
          if (prevIdx !== -1) {
            updatedTasks.splice(prevIdx + 1, 0, movedTask);
          } else {
            updatedTasks.push(movedTask);
          }
        } else {
          updatedTasks.push(movedTask);
        }

        onTasksChange(updatedTasks);
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
      onTaskUpdated();
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
      <div className="flex space-x-4 overflow-x-auto pb-2 pt-1 items-start h-full w-full px-1">
        {visibleColumns.map((column) => {
          const colTasks = tasks.filter((t) => t.column_id === column.id);
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              customFields={customFields}
              tasks={colTasks}
              onCardClick={onCardClick}
              onSubtaskToggle={onSubtaskToggle}
              onAddSubtask={onAddSubtask}
              onAddCard={onAddCard}
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="rotate-2 scale-105 shadow-2xl">
            <TaskCard task={activeTask} customFields={customFields} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
