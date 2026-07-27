import React, { useState, useEffect } from 'react';
import { StatusItem, Task, TaskStatus } from '../types/task';
import { X, Trash2, Save, FileText, Tag, User, AlignLeft, Maximize2, Minimize2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface TaskModalProps {
  isOpen: boolean;
  task: Task | null; // Null means create mode
  initialStatus?: TaskStatus;
  statuses?: StatusItem[];
  onClose: () => void;
  onSave: (taskData: Partial<Task>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  task,
  initialStatus = 'Todo',
  statuses = [],
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [tagsInput, setTagsInput] = useState('');
  const [assignee, setAssignee] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setStatus(task.status);
      setTagsInput(task.tags ? task.tags.join(', ') : '');
      setAssignee(task.assignee || '');
      setContent(task.content || '');
    } else {
      setTitle('');
      setStatus(initialStatus);
      setTagsInput('');
      setAssignee('');
      setContent('');
    }
  }, [task, initialStatus, isOpen]);

  if (!isOpen) return null;

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
        ...(task ? { id: task.id, column_id: task.column_id } : {}),
        title: title.trim(),
        status,
        tags,
        assignee: assignee.trim(),
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

  // Available status items fallback
  const availableStatuses = statuses.length > 0 ? statuses : [
    { id: 'Todo', name: 'Todo' },
    { id: 'In Progress', name: 'In Progress' },
    { id: 'Review', name: 'Review' },
    { id: 'Done', name: 'Done' },
  ];

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                {t('taskModal.statusLabel')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              >
                {availableStatuses.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {t('taskModal.assigneeLabel')}
              </label>
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="e.g. developer"
                className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

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
