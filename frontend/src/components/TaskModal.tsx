import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Column,
  CustomFieldDef,
  CustomFieldOption,
  CustomFieldType,
  CustomFieldValue,
  Task,
} from '../types/task';
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
  Columns,
  MoreVertical,
  Check,
  Loader2,
  AlertCircle,
  Clock,
  ExternalLink,
  Plus,
  Settings,
} from 'lucide-react';
import { MarkdownEditor, ChangeOptions } from './MarkdownEditor';
import { useI18n } from '../i18n/useI18n';
import { fetchTaskById } from '../services/api';
import { getSafeUrl } from '../utils/url';
import { COLOR_PRESETS } from '../constants/colors';

interface TaskModalProps {
  isOpen: boolean;
  task: Task | null; // Null means create mode
  columns?: Column[];
  initialColumnId?: string;
  customFields?: CustomFieldDef[];
  onClose: () => void;
  onSave: (taskData: Partial<Task>, options?: { silent?: boolean }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

interface FormState {
  title: string;
  columnId: string;
  tagsInput: string;
  content: string;
  customFieldsState: CustomFieldValue[];
  selectionStart?: number;
  selectionEnd?: number;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

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

  const parseInitialCustomFields = useCallback(
    (taskData: Task | null): CustomFieldValue[] => {
      if (!taskData || !taskData.custom_fields) return [];
      if (Array.isArray(taskData.custom_fields)) {
        return taskData.custom_fields.map((cf) => ({
          id:
            cf.id ||
            cf.field_id ||
            `cf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          field_id: cf.field_id,
          name: cf.name || cf.field_id || 'Field',
          type: cf.type || 'text',
          value: cf.value,
          options: cf.options,
          enabled: cf.enabled ?? true,
        }));
      }
      // Legacy Record<string, CustomFieldValue> fallback
      const legacyMap = taskData.custom_fields as unknown as Record<string, any>;
      return Object.entries(legacyMap).map(([key, cf]) => {
        const fieldDef = customFields.find((f) => f.id === key);
        return {
          id: key,
          field_id: key,
          name: fieldDef ? fieldDef.name : key.replace('cf-', ''),
          type: fieldDef ? fieldDef.type : 'text',
          options: fieldDef?.options,
          value: cf?.value ?? '',
          enabled: cf?.enabled ?? true,
        };
      });
    },
    [customFields]
  );

  const [customFieldsState, setCustomFieldsState] = useState<CustomFieldValue[]>(() =>
    parseInitialCustomFields(task)
  );

  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [addFieldMode, setAddFieldMode] = useState<'preset' | 'custom'>('preset');
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomType, setNewCustomType] = useState<CustomFieldType>('text');
  const [newOptionsInput, setNewOptionsInput] = useState(''); // Comma-separated or option list for dropdown
  const [editingOptionFieldId, setEditingOptionFieldId] = useState<string | null>(null);
  const [addOptionInput, setAddOptionInput] = useState('');

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const addFieldRef = useRef<HTMLDivElement>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef<FormState[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const lastPushTimeRef = useRef<number>(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestStateRef = useRef<FormState>({
    title,
    columnId,
    tagsInput,
    content,
    customFieldsState,
  });

  useEffect(() => {
    latestStateRef.current = {
      title,
      columnId,
      tagsInput,
      content,
      customFieldsState,
    };
  }, [title, columnId, tagsInput, content, customFieldsState]);

  const executeSave = useCallback(
    async (formStateToSave?: FormState) => {
      if (!task) return;
      const currentState = formStateToSave || latestStateRef.current;
      if (!currentState.title.trim()) return;

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      setSaveStatus('saving');
      setIsSaving(true);
      try {
        const tags = currentState.tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        await onSave(
          {
            id: task.id,
            title: currentState.title.trim(),
            column_id: currentState.columnId || columns[0]?.id,
            tags,
            custom_fields: currentState.customFieldsState,
            content: currentState.content.trim(),
          },
          { silent: true }
        );
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save error:', err);
        setSaveStatus('error');
      } finally {
        setIsSaving(false);
      }
    },
    [task, columns, onSave]
  );

  const triggerAutoSave = useCallback(
    (newState: FormState, immediate: boolean = false) => {
      if (!task) return;

      setSaveStatus('unsaved');
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      if (immediate) {
        executeSave(newState);
      } else {
        autoSaveTimerRef.current = setTimeout(() => {
          executeSave(newState);
        }, 500);
      }
    },
    [task, executeSave]
  );

  const handleCloseWithSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (task && (saveStatus === 'unsaved' || saveStatus === 'error')) {
      await executeSave();
    }
    onClose();
  }, [task, saveStatus, executeSave, onClose]);

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

  const prevIsOpenRef = useRef(false);
  const prevTaskIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const isNewOpen = isOpen && !prevIsOpenRef.current;
    const isTaskChanged = isOpen && task?.id !== prevTaskIdRef.current;

    if (isNewOpen || isTaskChanged) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setIsMenuOpen(false);
      const initialTitle = task ? task.title : '';
      const initialCol = task
        ? task.column_id || initialColumnId
        : initialColumnId || columns[0]?.id || '';
      const initialTags = task && task.tags ? task.tags.join(', ') : '';
      const initialContent = task ? task.content || '' : '';
      const initialFields = parseInitialCustomFields(task);

      setTitle(initialTitle);
      setColumnId(initialCol);
      setTagsInput(initialTags);
      setContent(initialContent);
      setCustomFieldsState(initialFields);
      setSaveStatus('saved');

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

      if (task?.id) {
        setIsLoadingContent(true);
        fetchTaskById(task.id)
          .then((fullTask) => {
            if (fullTask && fullTask.content !== undefined) {
              const fetchedContent = fullTask.content || '';
              setContent(fetchedContent);
              if (historyRef.current.length > 0) {
                historyRef.current[0].content = fetchedContent;
                latestStateRef.current.content = fetchedContent;
              }
            }
          })
          .catch((err) => {
            console.error('Error fetching full task content:', err);
          })
          .finally(() => {
            setIsLoadingContent(false);
          });
      } else {
        setIsLoadingContent(false);
      }
    }
    prevIsOpenRef.current = isOpen;
    prevTaskIdRef.current = task?.id;
  }, [isOpen, task, initialColumnId, columns, parseInitialCustomFields]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

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
    setCanUndo(newHistory.length - 1 > 0);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;
    if (index > 0) {
      const prevIndex = index - 1;
      const prevState = history[prevIndex];

      setTitle(prevState.title);
      setColumnId(prevState.columnId);
      setTagsInput(prevState.tagsInput);
      setContent(prevState.content);
      setCustomFieldsState(prevState.customFieldsState);

      historyIndexRef.current = prevIndex;
      setCanUndo(prevIndex > 0);
      setCanRedo(prevIndex < history.length - 1);
      triggerAutoSave(prevState, true);
    }
  }, [triggerAutoSave]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    const index = historyIndexRef.current;
    if (index < history.length - 1) {
      const nextIndex = index + 1;
      const nextState = history[nextIndex];

      setTitle(nextState.title);
      setColumnId(nextState.columnId);
      setTagsInput(nextState.tagsInput);
      setContent(nextState.content);
      setCustomFieldsState(nextState.customFieldsState);

      historyIndexRef.current = nextIndex;
      setCanUndo(nextIndex > 0);
      setCanRedo(nextIndex < history.length - 1);
      triggerAutoSave(nextState, true);
    }
  }, [triggerAutoSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseWithSave();
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
  }, [isOpen, handleCloseWithSave, handleUndo, handleRedo]);

  if (!isOpen) return null;

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    const newState = {
      title: newTitle,
      columnId,
      tagsInput,
      content,
      customFieldsState,
    };
    recordHistory(newState);
    triggerAutoSave(newState, false);
  };

  const handleColumnIdChange = (newColumnId: string) => {
    setColumnId(newColumnId);
    const newState = {
      title,
      columnId: newColumnId,
      tagsInput,
      content,
      customFieldsState,
    };
    recordHistory(newState, { immediate: true });
    triggerAutoSave(newState, true);
  };

  const handleTagsChange = (newTagsInput: string) => {
    setTagsInput(newTagsInput);
    const newState = {
      title,
      columnId,
      tagsInput: newTagsInput,
      content,
      customFieldsState,
    };
    recordHistory(newState);
    triggerAutoSave(newState, false);
  };

  const handleUpdateCustomField = (id: string, updates: Partial<CustomFieldValue>) => {
    setCustomFieldsState((prev) => {
      const nextCustomFields = prev.map((cf) => (cf.id === id ? { ...cf, ...updates } : cf));
      const isImmediate = typeof updates.value === 'boolean' || updates.enabled !== undefined;
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: isImmediate });
      triggerAutoSave(newState, isImmediate);
      return nextCustomFields;
    });
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFieldsState((prev) => {
      const nextCustomFields = prev.filter((cf) => cf.id !== id);
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
  };

  const handleAddPresetField = (preset: CustomFieldDef) => {
    const newField: CustomFieldValue = {
      id: `cf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      field_id: preset.id,
      name: preset.name,
      type: preset.type,
      options: preset.options ? [...preset.options] : undefined,
      value: preset.type === 'checkbox' ? false : '',
      enabled: true,
    };
    setCustomFieldsState((prev) => {
      const nextCustomFields = [...prev, newField];
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
    setIsAddFieldOpen(false);
  };

  const handleCreateCustomField = () => {
    if (!newCustomName.trim()) return;

    let options: CustomFieldOption[] | undefined;
    if (newCustomType === 'dropdown' && newOptionsInput.trim()) {
      const optionValues = newOptionsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      options = optionValues.map((val, idx) => ({
        id: `opt-${Date.now()}-${idx}`,
        value: val,
        color: COLOR_PRESETS[idx % COLOR_PRESETS.length],
      }));
    }

    const newField: CustomFieldValue = {
      id: `cf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: newCustomName.trim(),
      type: newCustomType,
      options,
      value: newCustomType === 'checkbox' ? false : '',
      enabled: true,
    };
    setCustomFieldsState((prev) => {
      const nextCustomFields = [...prev, newField];
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
    setNewCustomName('');
    setNewOptionsInput('');
    setIsAddFieldOpen(false);
  };

  const handleAddOptionToField = (fieldId: string, optionValue: string) => {
    const val = optionValue.trim();
    if (!val) return;
    setCustomFieldsState((prev) => {
      const nextCustomFields = prev.map((cf) => {
        if (cf.id === fieldId) {
          const currentOptions =
            cf.options ||
            (cf.field_id ? customFields.find((f) => f.id === cf.field_id)?.options || [] : []);
          if (currentOptions.some((opt) => opt.value === val)) return cf;
          const color = COLOR_PRESETS[currentOptions.length % COLOR_PRESETS.length];
          const newOpt: CustomFieldOption = {
            id: `opt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            value: val,
            color,
          };
          return { ...cf, options: [...currentOptions, newOpt] };
        }
        return cf;
      });
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
  };

  const handleOptionColorChange = (fieldId: string, optionId: string, color: string) => {
    setCustomFieldsState((prev) => {
      const nextCustomFields = prev.map((cf) => {
        if (cf.id === fieldId) {
          const currentOptions =
            cf.options ||
            (cf.field_id ? customFields.find((f) => f.id === cf.field_id)?.options || [] : []);
          const nextOptions = currentOptions.map((opt) =>
            opt.id === optionId || opt.value === optionId ? { ...opt, color } : opt
          );
          return { ...cf, options: nextOptions };
        }
        return cf;
      });
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
  };

  const handleOptionValueChange = (fieldId: string, optionId: string, newValue: string) => {
    setCustomFieldsState((prev) => {
      const nextCustomFields = prev.map((cf) => {
        if (cf.id === fieldId) {
          const currentOptions =
            cf.options ||
            (cf.field_id ? customFields.find((f) => f.id === cf.field_id)?.options || [] : []);
          const nextOptions = currentOptions.map((opt) =>
            opt.id === optionId || opt.value === optionId ? { ...opt, value: newValue } : opt
          );
          return { ...cf, options: nextOptions };
        }
        return cf;
      });
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
  };

  const handleRemoveOptionFromField = (fieldId: string, optionId: string) => {
    setCustomFieldsState((prev) => {
      const nextCustomFields = prev.map((cf) => {
        if (cf.id === fieldId) {
          const currentOptions =
            cf.options ||
            (cf.field_id ? customFields.find((f) => f.id === cf.field_id)?.options || [] : []);
          const nextOptions = currentOptions.filter(
            (opt) => opt.id !== optionId && opt.value !== optionId
          );
          return { ...cf, options: nextOptions };
        }
        return cf;
      });
      const newState = {
        title,
        columnId,
        tagsInput,
        content,
        customFieldsState: nextCustomFields,
      };
      recordHistory(newState, { immediate: true });
      triggerAutoSave(newState, true);
      return nextCustomFields;
    });
  };

  const handleContentChange = (newContent: string, options?: ChangeOptions) => {
    setContent(newContent);
    const newState = {
      title,
      columnId,
      tagsInput,
      content: newContent,
      customFieldsState,
      selectionStart: options?.selectionStart,
      selectionEnd: options?.selectionEnd,
    };
    recordHistory(newState, options);
    triggerAutoSave(newState, options?.immediate ?? false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (task) {
      await executeSave();
    } else {
      setIsSaving(true);
      try {
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        await onSave({
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
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    if (confirm(t('taskModal.deleteConfirm'))) {
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
              {/* Header Save Control: Auto-Save status badge for task edit, or Manual Save for task create */}
              {task ? (
                <button
                  type="button"
                  onClick={() => executeSave()}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                    saveStatus === 'saved'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : saveStatus === 'saving'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : saveStatus === 'error'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                  title="クリックで手動即時保存"
                >
                  {saveStatus === 'saved' && (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('taskModal.saved')}</span>
                    </>
                  )}
                  {saveStatus === 'saving' && (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      <span>{t('taskModal.saving')}</span>
                    </>
                  )}
                  {saveStatus === 'unsaved' && (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('taskModal.unsaved')}</span>
                    </>
                  )}
                  {saveStatus === 'error' && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{t('taskModal.saveError')}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? t('taskModal.saving') : t('taskModal.save')}</span>
                </button>
              )}

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
                {isMaximized ? (
                  <Minimize2 className="w-5 h-5" />
                ) : (
                  <Maximize2 className="w-5 h-5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleCloseWithSave}
                className="text-[var(--text-secondary)] hover:opacity-80 p-1.5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-4 sm:p-6 pb-8 sm:pb-12 space-y-4 overflow-y-auto flex-1 flex flex-col">
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
                        {col.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 w-4 h-4 text-[var(--text-secondary)] pointer-events-none" />
                </div>
              </div>
            )}

            {/* Custom Fields Section */}
            <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  <Sliders className="w-4 h-4 text-blue-500" />
                  <span>{t('taskModal.customFieldsLabel')}</span>
                  <span className="text-[10px] font-mono text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold">
                    {customFieldsState.length}
                  </span>
                </div>

                {/* Add Custom Field Button & Popover */}
                <div className="relative" ref={addFieldRef}>
                  <button
                    type="button"
                    onClick={() => setIsAddFieldOpen(!isAddFieldOpen)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md shadow-blue-600/30 transition-all cursor-pointer border border-blue-400/30"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('taskModal.addField')}</span>
                  </button>

                  {isAddFieldOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-[var(--modal-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-4 z-30 space-y-3 animate-in fade-in duration-150 ring-1 ring-black/10">
                      {/* Mode Selector Tabs */}
                      <div className="flex p-1 bg-[var(--bg-input)] rounded-xl text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setAddFieldMode('preset')}
                          className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                            addFieldMode === 'preset'
                              ? 'bg-blue-600 text-white font-bold shadow-sm'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {t('taskModal.addPreset')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddFieldMode('custom')}
                          className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                            addFieldMode === 'custom'
                              ? 'bg-blue-600 text-white font-bold shadow-sm'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {t('taskModal.addCustom')}
                        </button>
                      </div>

                      {/* Preset Tab Content */}
                      {addFieldMode === 'preset' && (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {customFields.length > 0 ? (
                            customFields.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleAddPresetField(preset)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-input)] hover:bg-blue-500/15 hover:text-blue-500 border border-transparent hover:border-blue-500/30 text-[var(--text-primary)] transition-all text-left"
                              >
                                <span>{preset.name}</span>
                                <span className="text-[10px] uppercase font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">
                                  {preset.type}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                              {t('taskModal.noPresets')}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Custom Field Creation Tab Content */}
                      {addFieldMode === 'custom' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                              {t('configModal.fieldTitle')} <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newCustomName}
                              onChange={(e) => setNewCustomName(e.target.value)}
                              placeholder="例: 優先度, 期日, 担当者"
                              className="w-full px-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                              {t('configModal.fieldType')}
                            </label>
                            <select
                              value={newCustomType}
                              onChange={(e) => setNewCustomType(e.target.value as CustomFieldType)}
                              className="w-full px-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            >
                              <option value="text">{t('configModal.typeText')}</option>
                              <option value="number">{t('configModal.typeNumber')}</option>
                              <option value="date">{t('configModal.typeDate')}</option>
                              <option value="dropdown">{t('configModal.typeDropdown')}</option>
                              <option value="checkbox">{t('configModal.typeCheckbox')}</option>
                              <option value="link">{t('configModal.typeLink')}</option>
                            </select>
                          </div>

                          {newCustomType === 'dropdown' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                                選択肢（カンマ区切り）
                              </label>
                              <input
                                type="text"
                                value={newOptionsInput}
                                onChange={(e) => setNewOptionsInput(e.target.value)}
                                placeholder="高, 中, 低"
                                className="w-full px-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          )}

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsAddFieldOpen(false)}
                              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-input)] rounded-xl"
                            >
                              {t('taskModal.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={handleCreateCustomField}
                              disabled={!newCustomName.trim()}
                              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md disabled:opacity-50"
                            >
                              {t('configModal.add')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Fields List */}
              {customFieldsState.length > 0 ? (
                <div className="flex flex-col space-y-3 pt-1">
                  {customFieldsState.map((field) => {
                    const resolvedOptions =
                      field.options ||
                      (field.field_id
                        ? customFields.find((f) => f.id === field.field_id)?.options
                        : undefined) ||
                      [];

                    return (
                      <div
                        key={field.id}
                        className="flex flex-col space-y-2 border-b border-[var(--border-color)] pb-3.5 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                            {/* Field Name Input (Editable on card) */}
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) =>
                                handleUpdateCustomField(field.id, { name: e.target.value })
                              }
                              className="text-xs font-bold text-[var(--text-primary)] bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-blue-500 focus:bg-[var(--bg-input)] px-1.5 py-0.5 rounded-md transition-all outline-none truncate flex-1 max-w-[220px]"
                              placeholder="フィールド名"
                            />
                            <span className="text-[10px] uppercase font-mono text-[var(--text-muted)] bg-[var(--bg-input)] px-1.5 py-0.5 rounded border border-[var(--border-color)] shrink-0">
                              {field.type}
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center space-x-1 shrink-0">
                            {field.type === 'dropdown' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingOptionFieldId(
                                    editingOptionFieldId === field.id ? null : field.id
                                  )
                                }
                                className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-lg transition-all font-medium ${
                                  editingOptionFieldId === field.id
                                    ? 'bg-blue-600/10 text-blue-500 border border-blue-500/30 font-bold'
                                    : 'text-[var(--text-secondary)] hover:text-blue-500 hover:bg-[var(--bg-input)]'
                                }`}
                                title="選択肢・色を編集"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                <span>選択肢編集</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomField(field.id)}
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              title={t('taskModal.removeField')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Field Control */}
                        <div>
                          {field.type === 'dropdown' && (
                            <div className="space-y-2">
                              <div className="relative flex items-center">
                                {(() => {
                                  const selectedOpt = resolvedOptions.find(
                                    (opt) => opt.value === field.value
                                  );
                                  const optionColor = selectedOpt?.color;
                                  return (
                                    <>
                                      {optionColor && (
                                        <span
                                          className="absolute left-3.5 w-3 h-3 rounded-full pointer-events-none transition-colors shadow-sm"
                                          style={{ backgroundColor: optionColor }}
                                        />
                                      )}
                                      <select
                                        value={String(field.value ?? '')}
                                        onChange={(e) =>
                                          handleUpdateCustomField(field.id, {
                                            value: e.target.value,
                                          })
                                        }
                                        className={`w-full py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer ${
                                          optionColor ? 'pl-9 pr-9 font-medium' : 'px-3 pr-9'
                                        }`}
                                      >
                                        <option value="">
                                          -- {t('configModal.typeDropdown')} --
                                        </option>
                                        {resolvedOptions.map((opt) => (
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
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Hidden by default: Options Management Panel */}
                              {editingOptionFieldId === field.id && (
                                <div className="bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-color)] space-y-2.5 animate-in fade-in duration-150">
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
                                    <span>プルダウン選択肢（色付け設定）:</span>
                                  </div>

                                  {/* Options List with Color Picker and Label Edit */}
                                  <div className="space-y-2">
                                    {resolvedOptions.length > 0 ? (
                                      resolvedOptions.map((opt) => (
                                        <div
                                          key={opt.id}
                                          className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] gap-2"
                                        >
                                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                                            <span
                                              className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                                              style={{ backgroundColor: opt.color || '#3b82f6' }}
                                            />
                                            <input
                                              type="text"
                                              value={opt.value}
                                              onChange={(e) =>
                                                handleOptionValueChange(
                                                  field.id,
                                                  opt.id,
                                                  e.target.value
                                                )
                                              }
                                              className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2 py-0.5 text-xs font-medium text-[var(--text-primary)] flex-1 outline-none truncate"
                                              placeholder="選択肢名"
                                            />
                                          </div>

                                          {/* Color Swatch Picker */}
                                          <div className="flex items-center space-x-1 justify-end shrink-0">
                                            {COLOR_PRESETS.map((colorHex) => (
                                              <button
                                                key={colorHex}
                                                type="button"
                                                onClick={() =>
                                                  handleOptionColorChange(
                                                    field.id,
                                                    opt.id,
                                                    colorHex
                                                  )
                                                }
                                                className={`w-3.5 h-3.5 rounded-full transition-transform ${
                                                  opt.color === colorHex
                                                    ? 'scale-125 ring-2 ring-white/60 shadow-md'
                                                    : 'hover:scale-110 opacity-70 hover:opacity-100'
                                                }`}
                                                style={{ backgroundColor: colorHex }}
                                              />
                                            ))}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleRemoveOptionFromField(field.id, opt.id)
                                              }
                                              className="p-1 text-xs text-rose-500 hover:text-rose-600 font-bold ml-1"
                                              title="選択肢を削除"
                                            >
                                              ×
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <span className="text-xs text-[var(--text-muted)] italic block">
                                        選択肢が設定されていません
                                      </span>
                                    )}
                                  </div>

                                  {/* Add Option Input Form */}
                                  <div className="flex items-center gap-1.5 pt-1">
                                    <input
                                      type="text"
                                      value={addOptionInput}
                                      onChange={(e) => setAddOptionInput(e.target.value)}
                                      placeholder="＋ 選択肢を追加（例: 高, 中, 低）"
                                      className="flex-1 px-2.5 py-1 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleAddOptionToField(field.id, addOptionInput);
                                          setAddOptionInput('');
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleAddOptionToField(field.id, addOptionInput);
                                        setAddOptionInput('');
                                      }}
                                      disabled={!addOptionInput.trim()}
                                      className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shrink-0 disabled:opacity-50"
                                    >
                                      追加
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {field.type === 'text' && (
                            <input
                              type="text"
                              value={String(field.value ?? '')}
                              onChange={(e) =>
                                handleUpdateCustomField(field.id, { value: e.target.value })
                              }
                              placeholder={field.name}
                              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'number' && (
                            <input
                              type="number"
                              value={String(field.value ?? '')}
                              onChange={(e) =>
                                handleUpdateCustomField(field.id, { value: e.target.value })
                              }
                              placeholder="0"
                              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'date' && (
                            <input
                              type="date"
                              value={String(field.value ?? '')}
                              onChange={(e) =>
                                handleUpdateCustomField(field.id, { value: e.target.value })
                              }
                              className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'checkbox' && (
                            <label className="flex items-center space-x-2 p-2 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!field.value}
                                onChange={(e) =>
                                  handleUpdateCustomField(field.id, { value: e.target.checked })
                                }
                                className="w-4 h-4 text-blue-600 rounded border border-[var(--border-color)] focus:ring-blue-500"
                              />
                              <span className="text-xs text-[var(--text-primary)] font-medium">
                                {field.name}
                              </span>
                            </label>
                          )}

                          {field.type === 'link' &&
                            (() => {
                              const safeUrl = getSafeUrl(field.value);
                              return (
                                <div className="relative flex items-center">
                                  <input
                                    type="text"
                                    value={String(field.value ?? '')}
                                    onChange={(e) =>
                                      handleUpdateCustomField(field.id, { value: e.target.value })
                                    }
                                    placeholder="https://... または vscode://..."
                                    className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 pr-9"
                                  />
                                  {safeUrl && (
                                    <a
                                      href={safeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute right-3 text-[var(--text-secondary)] hover:text-blue-500 transition-colors"
                                      title="リンクを開く"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              );
                            })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] text-center py-2 font-medium">
                  カスタムフィールドがありません。「＋ フィールドを追加」から追加できます。
                </p>
              )}
            </div>

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
            <div className="flex-1 flex flex-col min-h-[600px] relative">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <AlignLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />{' '}
                  {t('taskModal.contentLabel')}
                </span>
                {isLoadingContent && (
                  <span className="flex items-center gap-1 text-xs text-blue-500 font-normal normal-case">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading...</span>
                  </span>
                )}
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
