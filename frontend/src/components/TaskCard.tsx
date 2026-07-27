import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '../types/task';
import { GripVertical, Tag, User, Clock } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onCardClick: (task: Task) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onCardClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formattedDate = new Date(task.updated_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card group relative p-4 rounded-xl cursor-pointer ${
        isDragging ? 'opacity-40 ring-2 ring-blue-500 scale-[1.02] z-50' : ''
      }`}
      onClick={() => onCardClick(task)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[var(--text-primary)] text-sm leading-snug line-clamp-2 group-hover:text-blue-500 transition-colors">
          {task.title}
        </h3>
        
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Content Preview if exists */}
      {task.content && (
        <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2 font-normal leading-relaxed">
          {task.content.replace(/^#+\s+/gm, '')}
        </p>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center space-x-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20"
            >
              <Tag className="w-3 h-3 text-blue-500" />
              <span>{tag}</span>
            </span>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
        {task.assignee ? (
          <div className="flex items-center space-x-1 text-[var(--text-secondary)]">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span>{task.assignee}</span>
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center space-x-1 text-[var(--text-muted)] font-mono text-[10px]">
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
};
