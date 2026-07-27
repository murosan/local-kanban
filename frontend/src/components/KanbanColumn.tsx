import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column, Task } from '../types/task';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
  onCardClick: (task: Task) => void;
}

const statusColors: Record<string, { badge: string; border: string }> = {
  Todo: { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', border: 'border-t-amber-500' },
  'In Progress': { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20', border: 'border-t-blue-500' },
  Review: { badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20', border: 'border-t-purple-500' },
  Done: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', border: 'border-t-emerald-500' },
};

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ column, tasks, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.status,
  });

  const taskIds = tasks.map((t) => t.id);
  const colorStyle = statusColors[column.status] || { badge: 'bg-slate-800 text-slate-300', border: 'border-t-slate-600' };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-80 flex-shrink-0 glass-panel rounded-2xl border-t-2 ${colorStyle.border} ${
        isOver ? 'ring-2 ring-blue-500/50 opacity-90' : ''
      } transition-all duration-200`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-2.5">
          <h2 className="font-bold text-[var(--text-primary)] text-sm">{column.title}</h2>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colorStyle.badge}`}>
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto min-h-[400px]">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onCardClick={onCardClick} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 border-2 border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)] text-xs font-medium">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
};
