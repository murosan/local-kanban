import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChecklistItem, CustomFieldDef, Task } from '../types/task';
import {
  Tag,
  Clock,
  ExternalLink,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ListTree,
} from 'lucide-react';
import { getSafeUrl } from '../utils/url';
import { useI18n } from '../i18n/useI18n';

interface TaskCardProps {
  task: Task;
  customFields?: CustomFieldDef[];
  onCardClick?: (task: Task) => void;
  onSubtaskToggle?: (subtask: Task) => void;
  onAddSubtask?: (parentId: string, title: string) => Promise<void> | void;
  onChecklistItemToggle?: (task: Task, fieldId: string, itemId: string) => Promise<void> | void;
  isOverlay?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  customFields = [],
  onCardClick,
  onSubtaskToggle,
  onAddSubtask,
  onChecklistItemToggle,
  isOverlay,
}) => {
  const { t } = useI18n();
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [expandedChecklists, setExpandedChecklists] = useState<Record<string, boolean>>({});
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: task.id,
    data: { task },
    disabled: isOverlay,
    animateLayoutChanges: () => false,
  });

  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition: undefined,
      };

  const formattedDate = new Date(task.updated_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const displayFields = Array.isArray(task.custom_fields)
    ? task.custom_fields
        .filter((cf) => {
          if (!cf || cf.enabled === false) return false;
          if (cf.type === 'checklist') return true;
          if (Array.isArray(cf.value)) return cf.value.length > 0;
          return cf.value !== undefined && cf.value !== '' && cf.value !== false;
        })
        .map((cf) => {
          let resolvedColor: string | undefined;
          if (cf.type === 'dropdown' && cf.options) {
            const matchedOpt = cf.options.find((opt) => opt.value === cf.value);
            if (matchedOpt) {
              resolvedColor = matchedOpt.color;
            }
          }
          if (!resolvedColor && cf.field_id) {
            const fieldDef = customFields.find((f) => f.id === cf.field_id);
            if (fieldDef && fieldDef.type === 'dropdown' && fieldDef.options) {
              const matchedOpt = fieldDef.options.find((opt) => opt.value === cf.value);
              if (matchedOpt) {
                resolvedColor = matchedOpt.color;
              }
            }
          }

          return {
            id: cf.id || cf.field_id || cf.name,
            name: cf.name || cf.field_id || 'Field',
            type: cf.type,
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
      {(task.summary || task.content) && (
        <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2 font-normal leading-relaxed break-words">
          {task.summary || (task.content ? task.content.replace(/^#+\s+/gm, '') : '')}
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

      {/* User Custom Fields with Color Badges & Expandable Checklists */}
      {displayFields.length > 0 && (
        <div className="flex flex-col space-y-1.5 mt-3">
          {displayFields.map((field) => {
            const hasColor = !!field.color;
            const safeUrl = field.type === 'link' ? getSafeUrl(field.value) : null;
            const isChecklist = field.type === 'checklist';
            const isExpanded = Boolean(expandedChecklists[field.id]);

            if (isChecklist) {
              const items = Array.isArray(field.value) ? (field.value as ChecklistItem[]) : [];
              const completedCount = items.filter((i) => i.completed).length;
              const totalCount = items.length;
              const isAllDone = totalCount > 0 && completedCount === totalCount;
              const progressPercent =
                totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div
                  key={field.id}
                  className="rounded-lg bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)] overflow-hidden transition-all"
                >
                  <div
                    className="flex items-center justify-between text-[11px] px-2.5 py-1.5 cursor-pointer select-none hover:bg-[var(--bg-surface)] transition-colors group/chk"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedChecklists((prev) => ({
                        ...prev,
                        [field.id]: !prev[field.id],
                      }));
                    }}
                  >
                    <span className="text-[var(--text-secondary)] font-medium truncate max-w-[50%] flex items-center space-x-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{field.name}</span>
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`font-semibold font-mono text-[11px] px-1.5 py-0.5 rounded-full ${
                          isAllDone
                            ? 'bg-emerald-500/10 text-emerald-500 font-bold'
                            : 'bg-blue-500/10 text-blue-500'
                        }`}
                      >
                        {completedCount}/{totalCount}
                      </span>
                      <button
                        type="button"
                        className="p-0.5 rounded text-[var(--text-muted)] group-hover/chk:text-[var(--text-primary)] transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Checklist Content */}
                  {isExpanded && (
                    <div className="px-2.5 pb-2 pt-0.5 border-t border-[var(--border-color)] space-y-1.5">
                      {/* Progress bar */}
                      <div className="w-full bg-[var(--bg-surface)] rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isAllDone ? 'bg-emerald-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      {/* Items List */}
                      {items.length > 0 ? (
                        <div className="space-y-1 pt-0.5">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs py-0.5 px-1 rounded hover:bg-[var(--bg-surface)] transition-colors group/item cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                onChecklistItemToggle?.(task, field.id, item.id);
                              }}
                            >
                              <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onChecklistItemToggle?.(task, field.id, item.id);
                                  }}
                                  className="shrink-0 text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                                >
                                  {item.completed ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <span
                                  className={`truncate text-xs ${
                                    item.completed
                                      ? 'line-through text-[var(--text-muted)]'
                                      : 'text-[var(--text-primary)]'
                                  }`}
                                >
                                  {item.text}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[var(--text-muted)] italic py-1 text-center">
                          {t('taskModal.noChecklistItems') || 'チェック項目がありません'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            }

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
                  {safeUrl ? (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline text-blue-500 inline-flex items-center space-x-1 font-semibold truncate max-w-[120px]"
                      title={String(field.value)}
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{String(field.value)}</span>
                    </a>
                  ) : (
                    <span className="truncate max-w-[120px]">
                      {typeof field.value === 'boolean'
                        ? field.value
                          ? '✓'
                          : '✗'
                        : String(field.value ?? '')}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtasks Section */}
      {((task.subtasks_count !== undefined && task.subtasks_count > 0) ||
        (task.subtask_details && task.subtask_details.length > 0) ||
        (task.subtasks && task.subtasks.length > 0)) && (
        <div className="mt-3 pt-2.5 border-t border-[var(--border-color)]">
          <div
            className="flex items-center justify-between cursor-pointer py-1 select-none group/sub"
            onClick={(e) => {
              e.stopPropagation();
              setIsSubtasksExpanded((prev) => !prev);
            }}
          >
            <div className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)] font-medium">
              <ListTree className="w-3.5 h-3.5 text-blue-500" />
              <span>{t('taskCard.subtasks')}</span>
              <span
                className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-full ${
                  (task.subtasks_completed_count || 0) === (task.subtasks_count || 0) &&
                  (task.subtasks_count || 0) > 0
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-blue-500/10 text-blue-500'
                }`}
              >
                {task.subtasks_completed_count || 0}/
                {task.subtasks_count || task.subtask_details?.length || task.subtasks?.length || 0}
              </span>
            </div>
            <button
              type="button"
              className="p-1 rounded text-[var(--text-muted)] group-hover/sub:text-[var(--text-primary)] transition-colors"
            >
              {isSubtasksExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[var(--bg-input)] rounded-full h-1 mt-1 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                (task.subtasks_completed_count || 0) === (task.subtasks_count || 0) &&
                (task.subtasks_count || 0) > 0
                  ? 'bg-emerald-500'
                  : 'bg-blue-500'
              }`}
              style={{
                width: `${
                  (task.subtasks_count || 0) > 0
                    ? Math.round(
                        ((task.subtasks_completed_count || 0) / (task.subtasks_count || 1)) * 100
                      )
                    : 0
                }%`,
              }}
            />
          </div>

          {/* Expanded Subtasks List */}
          {isSubtasksExpanded && (
            <div className="mt-2 space-y-1.5 pl-1">
              {(task.subtask_details || []).map((sub) => {
                const isDone = Boolean(
                  sub.completed || task.subtasks?.find((s) => s.id === sub.id)?.completed
                );
                return (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-[var(--bg-input)] transition-colors group/item cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCardClick?.(sub);
                    }}
                  >
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSubtaskToggle?.(sub);
                        }}
                        className="shrink-0 text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                      >
                        {isDone ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span
                        className={`truncate text-xs ${
                          isDone
                            ? 'line-through text-[var(--text-muted)]'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {sub.title || sub.id}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Quick Add Subtask in Card */}
              {onAddSubtask && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                        e.preventDefault();
                        e.stopPropagation();
                        const title = newSubtaskTitle.trim();
                        setNewSubtaskTitle('');
                        await onAddSubtask(task.id, title);
                      }
                    }}
                    placeholder={t('taskCard.addSubtask')}
                    className="w-full text-xs px-2 py-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          )}
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
