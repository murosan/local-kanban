import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Columns } from 'lucide-react';
import { Column } from '../types/task';
import { useI18n } from '../i18n/useI18n';

interface CreateTaskModalProps {
  isOpen: boolean;
  columns: Column[];
  initialColumnId?: string;
  onClose: () => void;
  onSave: (taskData: { title: string; column_id: string }) => Promise<void>;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  columns = [],
  initialColumnId = '',
  onClose,
  onSave,
}) => {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [columnId, setColumnId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    // Only reset form state when the modal transitions from closed to open
    if (isOpen && !prevIsOpenRef.current) {
      setTitle('');
      const defaultCol = initialColumnId || columns[0]?.id || '';
      setColumnId(defaultCol);
      setIsSubmitting(false);

      // Focus input field on open
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialColumnId, columns]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        column_id: columnId || columns[0]?.id || '',
      });
    } catch (err) {
      console.error('Failed to create task:', err);
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-modal)] border border-[var(--border-color)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--text-primary)] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Plus className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold tracking-tight">
              {t('createModal.title') || '新規カード追加'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
            aria-label={t('common.close') || 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {t('taskModal.titleLabel') || 'タイトル'}
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('createModal.titlePlaceholder') || 'カードのタイトルを入力...'}
              className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
            />
          </div>

          {/* Column Select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {t('createModal.columnLabel') || 'カラム'}
            </label>
            <div className="relative">
              <Columns className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
              <select
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer font-medium"
              >
                {columns.map((col) => (
                  <option
                    key={col.id}
                    value={col.id}
                    className="bg-[var(--bg-card)] text-[var(--text-primary)]"
                  >
                    {col.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl transition-all active:scale-95"
            >
              {t('taskModal.cancel') || 'キャンセル'}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isSubmitting ? (
                <span>{t('createModal.adding') || '追加中...'}</span>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('createModal.add') || '追加'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
