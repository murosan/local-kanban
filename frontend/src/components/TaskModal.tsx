import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Column, CustomFieldDef, CustomFieldValue, Task } from '../types/task';
import {
  X,
  Trash2,
  Save,
  FileText,
  Tag,
  AlignLeft,
  Maximize2,
  Minimize2,
  Sliders,
  ChevronDown,
  Eye,
  EyeOff,
  Columns,
  MoreVertical,
} from 'lucide-react';
import { MarkdownEditor, ChangeOptions } from './MarkdownEditor';
import { useI18n } from '../i18n/useI18n';

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

interface FormState {
  title: string;
  columnId: string;
  tagsInput: string;
  content: string;
  customFieldsState: Record<string, CustomFieldValue>;
  selectionStart?: number;
  selectionEnd?: number;
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
  const [columnId, setColumnId] = useState<string>(() =>
    task ? task.column_id || initialColumnId : initialColumnId || columns[0]?.id || ''
  );
  const [tagsInput, setTagsInput] = useState(() => (task && task.tags ? task.tags.join(', ') : ''));
  const [content, setContent] = useState(() => (task ? task.content || '' : ''));
  const [customFieldsState, setCustomFieldsState] = useState<Record<string, CustomFieldValue>>(
    () => (task ? task.custom_fields || {} : {})
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef<FormState[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const lastPushTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsMenuOpen(false);
      const initialTitle = task ? task.title : '';
      const initialCol = task
        ? task.column_id || initialColumnId
        : initialColumnId || columns[0]?.id || '';
      const initialTags = task && task.tags ? task.tags.join(', ') : '';
      const initialContent = task ? task.content || '' : '';
      const initialFields = task ? task.custom_fields || {} : {};

      setTitle(initialTitle);
      setColumnId(initialCol);
      setTagsInput(initialTags);
      setContent(initialContent);
      setCustomFieldsState(initialFields);

      const initial: FormState = {
        title: initialTitle,
        columnId: initialCol,
        tagsInput: initialTags,
        content: initialContent,
        customFieldsState: initialFields,
      };
      historyRef.current = [initial];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [isOpen, task, initialColumnId, columns]);

  const recordHistory = useCallback((newState: FormState, options?: ChangeOptions) => {
    const now = Date.now();
    const isImmediate = options?.immediate ?? false;
    const history = historyRef.current;
    const index = historyIndexRef.current;

    const newHistory = index >= 0 ? history.slice(0, index + 1) : [];

    if (!isImmediate && newHistory.length > 0 && now - lastPushTimeRef.current < 400) {
      newHistory[newHistory.length - 1] = newState;
    } else {
      newHistory.push(newState);
      lastPushTimeRef.current = now;
    }

    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;
    if (index > 0) {
      const prevIndex = index - 1;
      const prevState = history[prevIndex];
      historyIndexRef.current = prevIndex;

      setTitle(prevState.title);
      setColumnId(prevState.columnId);
      setTagsInput(prevState.tagsInput);
      setContent(prevState.content);
      setCustomFieldsState(prevState.customFieldsState);

      setCanUndo(prevIndex > 0);
      setCanRedo(prevIndex < history.length - 1);
    }
  }, []);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;
    if (index < history.length - 1) {
      const nextIndex = index + 1;
      const nextState = history[nextIndex];
      historyIndexRef.current = nextIndex;

      setTitle(nextState.title);
      setColumnId(nextState.columnId);
      setTagsInput(nextState.tagsInput);
      setContent(nextState.content);
      setCustomFieldsState(nextState.customFieldsState);

      setCanUndo(nextIndex > 0);
      setCanRedo(nextIndex < history.length - 1);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && !e.isComposing) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          e.stopPropagation();
          handleRedo();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handleUndo, handleRedo]);

  if (!isOpen) return null;

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    recordHistory({
      title: newTitle,
      columnId,
      tagsInput,
      content,
      customFieldsState,
    });
  };

  const handleColumnIdChange = (newColumnId: string) => {
    setColumnId(newColumnId);
    recordHistory(
      {
        title,
        columnId: newColumnId,
        tagsInput,
        content,
        customFieldsState,
      },
      { immediate: true }
    );
  };

  const handleTagsChange = (newTagsInput: string) => {
    setTagsInput(newTagsInput);
    recordHistory({
      title,
      columnId,
      tagsInput: newTagsInput,
      content,
      customFieldsState,
    });
  };

  const handleToggleCustomField = (fieldId: string) => {
    setCustomFieldsState((prev) => {
      const current = prev[fieldId] || { field_id: fieldId, value: '', enabled: false };
      const nextCustomFields = {
        ...prev,
        [fieldId]: {
          ...current,
          enabled: !current.enabled,
        },
      };
      recordHistory(
        {
          title,
          columnId,
          tagsInput,
          content,
          customFieldsState: nextCustomFields,
        },
        { immediate: true }
      );
      return nextCustomFields;
    });
  };

  const handleCustomFieldValueChange = (
    fieldId: string,
    value: string | number | boolean | string[] | null
  ) => {
    setCustomFieldsState((prev) => {
      const current = prev[fieldId] || { field_id: fieldId, value: '', enabled: true };
      const nextCustomFields = {
        ...prev,
        [fieldId]: {
          ...current,
          value,
          enabled: true,
        },
      };
      const isImmediate = typeof value === 'boolean';
      recordHistory(
        {
          title,
          columnId,
          tagsInput,
          content,
          customFieldsState: nextCustomFields,
        },
        { immediate: isImmediate }
      );
      return nextCustomFields;
    });
  };

  const handleContentChange = (newContent: string, options?: ChangeOptions) => {
    setContent(newContent);
    recordHistory(
      {
        title,
        columnId,
        tagsInput,
        content: newContent,
        customFieldsState,
        selectionStart: options?.selectionStart,
        selectionEnd: options?.selectionEnd,
      },
      options
    );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full bg-[var(--modal-bg)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-color)] shadow-2xl overflow-hidden transition-all duration-300 ${
          isMaximized ? 'w-[99vw] h-[98vh] max-w-none max-h-none' : 'w-[98vw] max-w-7xl h-[97vh]'
        }`}
      >
        <form onSubmit={handleSubmit} className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
            <div className="flex items-center space-x-2.5">
              <FileText className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {task ? t('taskModal.editTitle') : t('taskModal.createTitle')}
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? t('taskModal.saving') : t('taskModal.save')}</span>
              </button>

              {task && onDelete && (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors flex items-center justify-center"
                    title="操作メニュー"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-36 bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-xl shadow-xl py-1 z-20 animate-in fade-in duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          handleDelete();
                        }}
                        disabled={isSaving}
                        className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors text-left"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{t('taskModal.delete')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

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
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 flex flex-col">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                {t('taskModal.titleLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
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
                    onChange={(e) => handleColumnIdChange(e.target.value)}
                    className="w-full py-2 px-3.5 pr-9 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
                  >
                    {columns.map((col) => (
                      <option
                        key={col.id}
                        value={col.id}
                        className="bg-[var(--modal-bg)] text-[var(--text-primary)]"
                      >
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
              <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)] space-y-3">
                <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  <Sliders className="w-4 h-4 text-blue-500" />
                  <span>{t('taskModal.customFieldsLabel')}</span>
                </div>

                <div className="flex flex-col space-y-4 pt-1">
                  {customFields.map((field) => {
                    const fieldState = customFieldsState[field.id] || {
                      field_id: field.id,
                      value: '',
                      enabled: false,
                    };
                    const isEnabled = fieldState.enabled;

                    return (
                      <div
                        key={field.id}
                        className="flex flex-col space-y-1.5 border-b border-[var(--border-color)] pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5">
                            <span>{field.name}</span>
                            <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                              ({field.type})
                            </span>
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
                                  : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-color)]'
                              }`}
                              title={
                                isEnabled ? t('taskModal.fieldEnabled') : t('taskModal.fieldDisabled')
                              }
                            >
                              {isEnabled ? (
                                <Eye className="w-3 h-3 text-blue-500" />
                              ) : (
                                <EyeOff className="w-3 h-3 text-[var(--text-muted)]" />
                              )}
                              <span>
                                {isEnabled
                                  ? t('taskModal.fieldEnabled')
                                  : t('taskModal.fieldDisabled')}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Field Control (Visible only when ON) */}
                        {isEnabled && (
                          <div>
                            {field.type === 'dropdown' &&
                              (() => {
                                const selectedOpt = field.options?.find(
                                  (opt) => opt.value === fieldState.value
                                );
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
                                      value={String(fieldState.value ?? '')}
                                      onChange={(e) =>
                                        handleCustomFieldValueChange(field.id, e.target.value)
                                      }
                                      className={`w-full py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer ${
                                        optionColor ? 'pl-9 pr-9 font-medium' : 'px-3 pr-9'
                                      }`}
                                    >
                                      <option value="">-- {t('configModal.typeDropdown')} --</option>
                                      {field.options?.map((opt) => (
                                        <option
                                          key={opt.id}
                                          value={opt.value}
                                          className="bg-[var(--modal-bg)] text-[var(--text-primary)]"
                                        >
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
                                value={String(fieldState.value ?? '')}
                                onChange={(e) =>
                                  handleCustomFieldValueChange(field.id, e.target.value)
                                }
                                placeholder={field.name}
                                className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                              />
                            )}

                            {field.type === 'number' && (
                              <input
                                type="number"
                                value={String(fieldState.value ?? '')}
                                onChange={(e) =>
                                  handleCustomFieldValueChange(field.id, e.target.value)
                                }
                                placeholder="0"
                                className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                              />
                            )}

                            {field.type === 'date' && (
                              <input
                                type="date"
                                value={String(fieldState.value ?? '')}
                                onChange={(e) =>
                                  handleCustomFieldValueChange(field.id, e.target.value)
                                }
                                className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                              />
                            )}

                            {field.type === 'checkbox' && (
                              <label className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!fieldState.value}
                                  onChange={(e) =>
                                    handleCustomFieldValueChange(field.id, e.target.checked)
                                  }
                                  className="w-4 h-4 text-blue-600 rounded border border-[var(--border-color)] focus:ring-blue-500"
                                />
                                <span className="text-xs text-[var(--text-primary)]">
                                  {field.name}
                                </span>
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
                onChange={(e) => handleTagsChange(e.target.value)}
                placeholder={t('taskModal.tagsPlaceholder')}
                className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Content (Markdown Body) */}
            <div className="flex-1 flex flex-col min-h-[600px]">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlignLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />{' '}
                {t('taskModal.contentLabel')}
              </label>
              <MarkdownEditor
                value={content}
                onChange={handleContentChange}
                placeholder={t('taskModal.contentPlaceholder')}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
