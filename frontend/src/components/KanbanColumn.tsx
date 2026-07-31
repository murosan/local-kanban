import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Column, CustomFieldDef, Task } from '../types/task';
import { TaskCard } from './TaskCard';
import { useI18n } from '../i18n/useI18n';

interface KanbanColumnProps {
  column: Column;
  customFields?: CustomFieldDef[];
  tasks: Task[];
  onCardClick: (task: Task) => void;
  onAddCard?: (columnId: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  customFields = [],
  tasks,
  onCardClick,
  onAddCard,
}) => {
  const { t } = useI18n();
  const columnDropId = column.id;
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId,
  });

  const taskIds = tasks.map((t) => t.id);
  const columnAccentColor = column.color || '#3b82f6';

  return (
    <div
      ref={setNodeRef}
      style={{ borderTopColor: columnAccentColor }}
      className={`flex flex-col w-80 flex-shrink-0 max-h-full glass-panel rounded-2xl border-t-2 ${
        isOver ? 'ring-2 ring-blue-500/50 opacity-90' : ''
      } transition-all duration-200`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-2.5">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: columnAccentColor }} />
          <h2 className="font-bold text-[var(--text-primary)] text-sm">{column.name}</h2>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: `${columnAccentColor}20`,
              color: columnAccentColor,
              borderColor: `${columnAccentColor}40`,
            }}
          >
            {tasks.length}
          </span>
        </div>

        {/* Add Card Button */}
        <button
          onClick={() => onAddCard && onAddCard(column.id)}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-color)] transition-all active:scale-95"
          title={t('column.addCardTooltip')}
          aria-label={t('column.addCard')}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto min-h-0">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              customFields={customFields}
              onCardClick={onCardClick}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 border-2 border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)] text-xs font-medium">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
};
