import React, { useState, useEffect } from 'react';
import { Column, StatusItem } from '../types/task';
import { useI18n } from '../i18n/I18nContext';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface ColumnManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: Column[];
  statuses: StatusItem[];
  onSaveConfig: (newColumns: Column[], newStatuses: StatusItem[]) => Promise<void>;
}

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
  isOpen,
  onClose,
  columns,
  statuses,
  onSaveConfig,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'columns' | 'statuses'>('columns');
  
  const [localColumns, setLocalColumns] = useState<Column[]>([]);
  const [localStatuses, setLocalStatuses] = useState<StatusItem[]>([]);
  
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newStatusName, setNewStatusName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    setLocalColumns(
      columns.map((col, idx) => ({
        ...col,
        visible: col.visible !== false,
        order: col.order ?? idx + 1,
      }))
    );

    if (statuses && statuses.length > 0) {
      setLocalStatuses(statuses);
    } else {
      setLocalStatuses([
        { id: 'Todo', name: 'Todo' },
        { id: 'In Progress', name: 'In Progress' },
        { id: 'Review', name: 'Review' },
        { id: 'Done', name: 'Done' },
      ]);
    }
  }, [columns, statuses, isOpen]);

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

  // --- Column Actions ---
  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localColumns.length) return;

    const updated = [...localColumns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    const reordered = updated.map((col, idx) => ({ ...col, order: idx + 1 }));
    setLocalColumns(reordered);
  };

  const handleToggleVisibility = (index: number) => {
    const updated = [...localColumns];
    updated[index] = { ...updated[index], visible: !updated[index].visible };
    setLocalColumns(updated);
  };

  const handleDeleteColumn = (index: number) => {
    if (localColumns.length <= 1) {
      alert(t('configModal.atLeastOneColumn'));
      return;
    }
    const colToDelete = localColumns[index];
    if (confirm(t('configModal.deleteColumnConfirm', { title: colToDelete.title }))) {
      const updated = localColumns.filter((_, i) => i !== index);
      const reordered = updated.map((col, idx) => ({ ...col, order: idx + 1 }));
      setLocalColumns(reordered);
    }
  };

  const handleColumnTitleChange = (index: number, newTitle: string) => {
    const updated = [...localColumns];
    updated[index] = { ...updated[index], title: newTitle };
    setLocalColumns(updated);
  };

  const handleColumnStatusChange = (index: number, newStatus: string) => {
    const updated = [...localColumns];
    updated[index] = { ...updated[index], status: newStatus };
    setLocalColumns(updated);
  };

  const handleAddColumn = () => {
    if (!newColumnTitle.trim()) return;
    const title = newColumnTitle.trim();
    const id = `col-${Date.now()}`;
    const defaultStatus = localStatuses[0]?.name || 'Todo';
    const newCol: Column = {
      id,
      title,
      status: defaultStatus,
      visible: true,
      order: localColumns.length + 1,
    };
    setLocalColumns([...localColumns, newCol]);
    setNewColumnTitle('');
  };

  // --- Status Actions ---
  const handleStatusNameChange = (index: number, newName: string) => {
    const updated = [...localStatuses];
    const oldName = updated[index].name;
    updated[index] = { ...updated[index], name: newName };
    setLocalStatuses(updated);

    // Also update linked status in localColumns if name matches
    setLocalColumns(
      localColumns.map((col) => (col.status === oldName ? { ...col, status: newName } : col))
    );
  };

  const handleDeleteStatus = (index: number) => {
    if (localStatuses.length <= 1) {
      alert(t('configModal.atLeastOneStatus'));
      return;
    }
    const targetStatus = localStatuses[index];
    if (confirm(t('configModal.deleteStatusConfirm', { name: targetStatus.name }))) {
      const updated = localStatuses.filter((_, i) => i !== index);
      setLocalStatuses(updated);

      // Reassign columns using targetStatus to fallback status
      const fallbackStatus = updated[0].name;
      setLocalColumns(
        localColumns.map((col) =>
          col.status === targetStatus.name ? { ...col, status: fallbackStatus } : col
        )
      );
    }
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;
    const name = newStatusName.trim();
    const id = `status-${Date.now()}`;
    const newStatus: StatusItem = { id, name };
    setLocalStatuses([...localStatuses, newStatus]);
    setNewStatusName('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig(localColumns, localStatuses);
      onClose();
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-3 animate-fade-in">
      <div className={`bg-[var(--modal-bg)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isMaximized ? 'w-[98vw] h-[96vh] max-w-none max-h-none' : 'max-w-3xl h-[90vh]'
      }`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <span>⚙️</span>
            <span>{t('configModal.title')}</span>
          </h2>
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

        {/* Tab Header */}
        <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-6 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('columns')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'columns'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:opacity-80'
            }`}
          >
            📋 {t('configModal.tabColumns')}
          </button>
          <button
            onClick={() => setActiveTab('statuses')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'statuses'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:opacity-80'
            }`}
          >
            🏷️ {t('configModal.tabStatuses')}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {activeTab === 'columns' ? (
            /* Columns Tab */
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">{t('configModal.columnsDesc')}</p>

              <div className="space-y-3">
                {localColumns.map((col, idx) => (
                  <div
                    key={col.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3 transition-all ${
                      col.visible !== false
                        ? 'border-[var(--border-color)] bg-[var(--bg-card)]'
                        : 'border-[var(--border-color)] opacity-60'
                    }`}
                  >
                    {/* Title Input */}
                    <div className="flex items-center space-x-2 flex-1">
                      <input
                        type="text"
                        value={col.title}
                        onChange={(e) => handleColumnTitleChange(idx, e.target.value)}
                        className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2.5 py-1 text-sm font-medium text-[var(--text-primary)] flex-1 outline-none"
                      />
                      {/* Linked Status Selector */}
                      <select
                        value={col.status}
                        onChange={(e) => handleColumnStatusChange(idx, e.target.value)}
                        className="bg-[var(--bg-input)] border border-[var(--border-color)] text-xs rounded px-2 py-1.5 text-[var(--text-primary)] focus:border-blue-500"
                        title={t('configModal.selectStatus')}
                      >
                        {localStatuses.map((st) => (
                          <option key={st.id} value={st.name}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Actions: Move Up, Move Down, Toggle Visibility, Delete */}
                    <div className="flex items-center space-x-1.5 justify-end">
                      <button
                        disabled={idx === 0}
                        onClick={() => handleMoveColumn(idx, 'up')}
                        className="p-1.5 text-xs bg-[var(--bg-card)] hover:opacity-80 disabled:opacity-30 border border-[var(--border-color)] rounded text-[var(--text-primary)] transition-colors"
                        title="Move Up / Left"
                      >
                        ▲
                      </button>
                      <button
                        disabled={idx === localColumns.length - 1}
                        onClick={() => handleMoveColumn(idx, 'down')}
                        className="p-1.5 text-xs bg-[var(--bg-card)] hover:opacity-80 disabled:opacity-30 border border-[var(--border-color)] rounded text-[var(--text-primary)] transition-colors"
                        title="Move Down / Right"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => handleToggleVisibility(idx)}
                        className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                          col.visible !== false
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                        }`}
                      >
                        {col.visible !== false ? t('configModal.visible') : t('configModal.hidden')}
                      </button>
                      <button
                        onClick={() => handleDeleteColumn(idx)}
                        className="p-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-rose-500 transition-colors"
                        title="Delete Column"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Column */}
              <div className="pt-4 border-t border-[var(--border-color)]">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                  {t('configModal.addColumn')}
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder={t('configModal.columnTitlePlaceholder')}
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                  <button
                    onClick={handleAddColumn}
                    className="px-4 py-2 bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors"
                  >
                    {t('configModal.add')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Statuses Tab */
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">{t('configModal.statusesDesc')}</p>

              <div className="space-y-3">
                {localStatuses.map((st, idx) => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]"
                  >
                    <input
                      type="text"
                      value={st.name}
                      onChange={(e) => handleStatusNameChange(idx, e.target.value)}
                      className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2.5 py-1 text-sm font-medium text-[var(--text-primary)] flex-1 mr-3 outline-none"
                    />
                    <button
                      onClick={() => handleDeleteStatus(idx)}
                      className="p-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-rose-500 transition-colors"
                      title="Delete Status"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Status */}
              <div className="pt-4 border-t border-[var(--border-color)]">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                  {t('configModal.addStatus')}
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder={t('configModal.statusNamePlaceholder')}
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                  <button
                    onClick={handleAddStatus}
                    className="px-4 py-2 bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors"
                  >
                    {t('configModal.add')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)] space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--bg-card)] hover:opacity-80 text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg text-sm font-medium transition-colors"
          >
            {t('configModal.cancel')}
          </button>
          <button
            disabled={isSaving}
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? t('configModal.saving') : t('configModal.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
