import React, { useState, useEffect } from 'react';
import { Column, CustomFieldDef, CustomFieldValue, Task } from '../types/task';
import { X, Trash2, Save, FileText, Tag, AlignLeft, Maximize2, Minimize2, Sliders, ChevronDown, Eye, EyeOff, Columns } from 'lucide-react';

import { useI18n } from '../i18n/I18nContext';

interface TaskModalProps {
  isOpen: boolean;
  task: Task | null; // Null means create mode
  columns?: Column[];
  initialColumnId?: string;
  customFields?: CustomFieldDef[];
  onClose: () => void;
  onSave: (taskData: Partial<Task>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  task,
  columns = [],
  initialColumnId = '',
  customFields = [],
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useI18n();
  const [title, setTitle] = useState(() => (task ? task.title : ''));
  const [columnId, setColumnId] = useState<string>(() => (task ? task.column_id || initialColumnId : initialColumnId || columns[0]?.id || ''));
  const [tagsInput, setTagsInput] = useState(() => (task && task.tags ? task.tags.join(', ') : ''));
  const [content, setContent] = useState(() => (task ? task.content || '' : ''));
  const [customFieldsState, setCustomFieldsState] = useState<Record<string, CustomFieldValue>>(() => (task ? task.custom_fields || {} : {}));

  const [isSaving, setIsSaving] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleCustomField = (fieldId: string) => {
    setCustomFieldsState((prev) => {
      const current = prev[fieldId] || { field_id: fieldId, value: '', enabled: false };
      return {
        ...prev,
        [fieldId]: {
          ...current,
          enabled: !current.enabled,
        },
      };
    });
  };

  const handleCustomFieldValueChange = (fieldId: string, value: any) => {
    setCustomFieldsState((prev) => {
      const current = prev[fieldId] || { field_id: fieldId, value: '', enabled: true };
      return {
        ...prev,
        [fieldId]: {
          ...current,
          value,
          enabled: true,
        },
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await onSave({
        ...(task ? { id: task.id } : {}),
        title: title.trim(),
        column_id: columnId || columns[0]?.id,
        tags,
        custom_fields: customFieldsState,
        content: content.trim(),
      });

      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    if (confirm('Are you sure you want to delete this task Markdown file?')) {
      setIsSaving(true);
      try {
        await onDelete(task.id);
        onClose();
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`w-full bg-[var(--modal-bg)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
        isMaximized ? 'w-[98vw] h-[96vh] max-w-none max-h-none' : 'max-w-4xl h-[90vh]'
      }`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center space-x-2.5">
            <FileText className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {task ? t('taskModal.editTitle') : t('taskModal.createTitle')}
            </h2>
          </div>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
              title={isMaximized ? t('modal.minimize') : t('modal.maximize')}
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 flex flex-col">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
              {t('taskModal.titleLabel')} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement authentication logic"
              className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Column Selector */}
          {columns.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Columns className="w-3.5 h-3.5 text-[var(--text-muted)]" /> カラム
              </label>
              <div className="relative flex items-center">
                <select
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                  className="w-full py-2 px-3.5 pr-9 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
                >
                  {columns.map((col) => (
                    <option key={col.id} value={col.id} className="bg-[var(--modal-bg)] text-[var(--text-primary)]">
                      {col.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 w-4 h-4 text-[var(--text-secondary)] pointer-events-none" />
              </div>
            </div>
          )}

          {/* Custom Fields Section (Trello Style) */}
          {customFields.length > 0 && (
            <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)]/70 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-blue-500" />
                <span>{t('taskModal.customFieldsLabel')}</span>
              </div>

              <div className="flex flex-col space-y-4 pt-1">
                {customFields.map((field) => {
                  const fieldState = customFieldsState[field.id] || { field_id: field.id, value: '', enabled: false };
                  const isEnabled = fieldState.enabled;

                  return (
                    <div key={field.id} className="flex flex-col space-y-1.5 border-b border-[var(--border-color)]/30 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5">
                          <span>{field.name}</span>
                          <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">({field.type})</span>
                        </label>

                        {/* ON/OFF Toggle Switch & Clear Button */}
                        <div className="flex items-center space-x-1.5">
                          {isEnabled && (
                            <button
                              type="button"
                              onClick={() => handleToggleCustomField(field.id)}
                              className="text-[11px] text-rose-400 hover:text-rose-500 font-medium underline px-1"
                              title="このカードからフィールドを削除 (OFF)"
                            >
                              削除
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleCustomField(field.id)}
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                              isEnabled
                                ? 'bg-blue-600/10 text-blue-500 border-blue-500/30'
                                : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-color)]'
                            }`}
                            title={isEnabled ? t('taskModal.fieldEnabled') : t('taskModal.fieldDisabled')}
                          >
                            {isEnabled ? <Eye className="w-3 h-3 text-blue-500" /> : <EyeOff className="w-3 h-3 text-[var(--text-muted)]" />}
                            <span>{isEnabled ? t('taskModal.fieldEnabled') : t('taskModal.fieldDisabled')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Field Control (Visible only when ON) */}
                      {isEnabled && (
                        <div>
                          {field.type === 'dropdown' && (() => {
                            const selectedOpt = field.options?.find((opt) => opt.value === fieldState.value);
                            const optionColor = selectedOpt?.color;

                            return (
                              <div className="relative flex items-center">
                                {optionColor && (
                                  <span
                                    className="absolute left-3.5 w-3 h-3 rounded-full pointer-events-none transition-colors shadow-sm"
                                    style={{ backgroundColor: optionColor }}
                                  />
                                )}
                                <select
                                  value={fieldState.value || ''}
                                  onChange={(e) => handleCustomFieldValueChange(field.id, e.target.value)}
                                  className={`w-full py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer ${
                                    optionColor ? 'pl-9 pr-9 font-medium' : 'px-3 pr-9'
                                  }`}
                                >
                                  <option value="">-- {t('configModal.typeDropdown')} --</option>
                                  {field.options?.map((opt) => (
                                    <option key={opt.id} value={opt.value} className="bg-[var(--modal-bg)] text-[var(--text-primary)]">
                                      {opt.value}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-3 w-4 h-4 text-[var(--text-secondary)] pointer-events-none" />
                              </div>
                            );
                          })()}

                          {field.type === 'text' && (
                            <input
                              type="text"
                              value={fieldState.value || ''}
                              onChange={(e) => handleCustomFieldValueChange(field.id, e.target.value)}
                              placeholder={field.name}
                              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'number' && (
                            <input
                              type="number"
                              value={fieldState.value ?? ''}
                              onChange={(e) => handleCustomFieldValueChange(field.id, e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'date' && (
                            <input
                              type="date"
                              value={fieldState.value || ''}
                              onChange={(e) => handleCustomFieldValueChange(field.id, e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'checkbox' && (
                            <label className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!fieldState.value}
                                onChange={(e) => handleCustomFieldValueChange(field.id, e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded border-[var(--border-color)] focus:ring-blue-500"
                              />
                              <span className="text-xs text-[var(--text-primary)]">{field.name}</span>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('taskModal.tagsLabel')}
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('taskModal.tagsPlaceholder')}
              className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Content (Markdown Body) */}
          <div className="flex-1 flex flex-col min-h-[200px]">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <AlignLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('taskModal.contentLabel')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('taskModal.contentPlaceholder')}
              className="w-full flex-1 p-3.5 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 font-mono text-xs min-h-[160px] resize-y"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)]">
            {task && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 rounded-xl transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('taskModal.delete')}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:opacity-80 transition-colors"
              >
                {t('taskModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? t('taskModal.saving') : t('taskModal.save')}</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
