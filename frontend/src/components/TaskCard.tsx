import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CustomFieldDef, Task } from '../types/task';
import { Tag, Clock } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  customFields?: CustomFieldDef[];
  onCardClick?: (task: Task) => void;
  isOverlay?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  customFields = [],
  onCardClick,
  isOverlay,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
    disabled: isOverlay,
  });

  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const formattedDate = new Date(task.updated_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const displayFields = task.custom_fields
    ? Object.entries(task.custom_fields)
        .filter(
          ([_, cf]) =>
            cf && cf.enabled && cf.value !== undefined && cf.value !== '' && cf.value !== false
        )
        .map(([fieldId, cf]) => {
          // Resolve option color if dropdown field definition exists
          const fieldDef = customFields.find((f) => f.id === fieldId);
          let resolvedColor: string | undefined;
          if (fieldDef && fieldDef.type === 'dropdown' && fieldDef.options) {
            const matchedOpt = fieldDef.options.find((opt) => opt.value === cf.value);
            if (matchedOpt) {
              resolvedColor = matchedOpt.color;
            }
          }

          return {
            id: fieldId,
            name: fieldDef ? fieldDef.name : fieldId.replace('cf-', ''),
            value: cf.value,
            color: resolvedColor,
          };
        })
    : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`glass-card group relative p-4 rounded-xl cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-40 ring-2 ring-blue-500 scale-[1.02] z-50' : ''
      }`}
      onClick={() => onCardClick && onCardClick(task)}
    >
      {/* Title */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[var(--text-primary)] text-sm leading-snug line-clamp-2 break-words group-hover:text-blue-500 transition-colors">
          {task.title}
        </h3>
      </div>

      {/* Content Preview if exists */}
      {task.content && (
        <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2 font-normal leading-relaxed break-words">
          {task.content.replace(/^#+\s+/gm, '')}
        </p>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
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

      {/* User Custom Fields with Color Badges */}
      {displayFields.length > 0 && (
        <div className="flex flex-col space-y-1 mt-3">
          {displayFields.map((field) => {
            const hasColor = !!field.color;
            return (
              <div
                key={field.id}
                className="flex items-center justify-between text-[11px] px-2.5 py-1 rounded-md bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)]"
              >
                <span className="text-[var(--text-muted)] font-medium truncate max-w-[50%]">
                  {field.name}
                </span>
                <span
                  className={`font-semibold text-right flex items-center justify-end space-x-1.5 px-2 py-0.5 rounded-md ${
                    hasColor ? '' : 'text-[var(--text-primary)]'
                  }`}
                  style={
                    hasColor
                      ? {
                          backgroundColor: `${field.color}20`,
                          color: field.color,
                          border: `1px solid ${field.color}40`,
                        }
                      : undefined
                  }
                >
                  {hasColor && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: field.color }}
                    />
                  )}
                  <span className="truncate max-w-[120px]">
                    {typeof field.value === 'boolean'
                      ? field.value
                        ? '✓'
                        : '✗'
                      : String(field.value)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-end mt-3.5 pt-2.5 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
        <div className="flex items-center space-x-1 text-[var(--text-muted)] font-mono text-[10px]">
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
};
