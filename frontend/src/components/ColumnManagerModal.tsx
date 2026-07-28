import React, { useState, useEffect } from 'react';
import { Column, CustomFieldDef, CustomFieldOption, CustomFieldType } from '../types/task';
import { useI18n } from '../i18n/I18nContext';
import { Maximize2, Minimize2, X, Sliders, Plus, Trash2 } from 'lucide-react';

interface ColumnManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: Column[];
  customFields?: CustomFieldDef[];
  onSaveConfig: (newColumns: Column[], newCustomFields?: CustomFieldDef[]) => Promise<void>;
}

export const ColumnManagerModal: React.FC<ColumnManagerModalProps> = ({
  isOpen,
  onClose,
  columns,
  customFields = [],
  onSaveConfig,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'columns' | 'customFields'>('columns');
  
  const [localColumns, setLocalColumns] = useState<Column[]>(() =>
    columns.map((col, idx) => ({
      ...col,
      visible: col.visible !== false,
      order: col.order ?? idx + 1,
    }))
  );
  const [localCustomFields, setLocalCustomFields] = useState<CustomFieldDef[]>(() => customFields || []);

  const [newColumnTitle, setNewColumnTitle] = useState('');

  // New Custom Field state
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('dropdown');
  const [newFieldOptionsInput, setNewFieldOptionsInput] = useState('');

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

  // --- Custom Field Actions ---
  const handleAddCustomField = () => {
    if (!newFieldName.trim()) return;

    let options: CustomFieldOption[] | undefined;
    if (newFieldType === 'dropdown') {
      const optionValues = newFieldOptionsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      options = optionValues.map((val, idx) => ({
        id: `opt-${Date.now()}-${idx}`,
        value: val,
      }));
    }

    const newField: CustomFieldDef = {
      id: `cf-${Date.now()}`,
      name: newFieldName.trim(),
      type: newFieldType,
      options,
    };

    setLocalCustomFields([...localCustomFields, newField]);
    setNewFieldName('');
    setNewFieldOptionsInput('');
    setNewFieldType('dropdown');
  };

  const handleDeleteCustomField = (index: number) => {
    const target = localCustomFields[index];
    if (confirm(`カスタムフィールド「${target.name}」全体を削除してもよろしいですか？`)) {
      setLocalCustomFields(localCustomFields.filter((_, i) => i !== index));
    }
  };

  const handleFieldNameChange = (fieldIndex: number, newName: string) => {
    const updated = [...localCustomFields];
    updated[fieldIndex] = {
      ...updated[fieldIndex],
      name: newName,
    };
    setLocalCustomFields(updated);
  };

  const handleRemoveOptionFromCustomField = (fieldIndex: number, optionId: string) => {
    const updated = [...localCustomFields];
    const targetField = updated[fieldIndex];
    if (targetField.options) {
      targetField.options = targetField.options.filter((opt) => opt.id !== optionId);
      setLocalCustomFields(updated);
    }
  };

  const handleOptionColorChange = (fieldIndex: number, optionId: string, color: string) => {
    const updated = [...localCustomFields];
    const targetField = updated[fieldIndex];
    if (targetField.options) {
      targetField.options = targetField.options.map((opt) =>
        opt.id === optionId ? { ...opt, color } : opt
      );
      setLocalCustomFields(updated);
    }
  };

  const handleOptionValueChange = (fieldIndex: number, optionId: string, newValue: string) => {
    const updated = [...localCustomFields];
    const targetField = updated[fieldIndex];
    if (targetField.options) {
      targetField.options = targetField.options.map((opt) =>
        opt.id === optionId ? { ...opt, value: newValue } : opt
      );
      setLocalCustomFields(updated);
    }
  };

  const handleAddOptionToField = (fieldIndex: number, optionValue: string) => {
    if (!optionValue.trim()) return;
    const updated = [...localCustomFields];
    const targetField = updated[fieldIndex];
    if (!targetField.options) {
      targetField.options = [];
    }
    const color = COLOR_PRESETS[targetField.options.length % COLOR_PRESETS.length];
    targetField.options.push({
      id: `opt-${Date.now()}`,
      value: optionValue.trim(),
      color,
    });
    setLocalCustomFields(updated);
  };

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

  const handleColumnColorChange = (index: number, color: string) => {
    const updated = [...localColumns];
    updated[index] = { ...updated[index], color };
    setLocalColumns(updated);
  };

  const handleAddColumn = () => {
    if (!newColumnTitle.trim()) return;
    const title = newColumnTitle.trim();
    const id = `col-${Date.now()}`;
    const color = COLOR_PRESETS[localColumns.length % COLOR_PRESETS.length];
    const newCol: Column = {
      id,
      title,
      color,
      visible: true,
      order: localColumns.length + 1,
    };
    setLocalColumns([...localColumns, newCol]);
    setNewColumnTitle('');
  };

  const COLOR_PRESETS = [
    '#3b82f6', // Blue
    '#06b6d4', // Cyan
    '#0284c7', // Sky Blue
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#d946ef', // Fuchsia
    '#ec4899', // Pink
    '#f43f5e', // Rose
    '#ef4444', // Red
    '#f97316', // Orange
    '#f59e0b', // Amber
    '#eab308', // Yellow
    '#84cc16', // Lime
    '#10b981', // Emerald
    '#14b8a6', // Teal
    '#64748b', // Slate
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let finalCustomFields = [...localCustomFields];
      if (newFieldName.trim()) {
        let options: CustomFieldOption[] | undefined;
        if (newFieldType === 'dropdown') {
          const optionValues = newFieldOptionsInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          options = optionValues.map((val, idx) => ({
            id: `opt-${Date.now()}-${idx}`,
            value: val,
          }));
        }
        const pendingField: CustomFieldDef = {
          id: `cf-${Date.now()}`,
          name: newFieldName.trim(),
          type: newFieldType,
          options,
        };
        finalCustomFields.push(pendingField);
      }

      await onSaveConfig(localColumns, finalCustomFields);
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
            onClick={() => setActiveTab('customFields')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'customFields'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:opacity-80'
            }`}
          >
            <span>🎛️</span>
            <span>カスタムフィールド設定</span>
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
                    className={`flex flex-col p-3 rounded-lg border gap-2.5 transition-all ${
                      col.visible !== false
                        ? 'border-[var(--border-color)] bg-[var(--bg-card)]'
                        : 'border-[var(--border-color)] opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Title & Color Input */}
                      <div className="flex items-center space-x-2 flex-1">
                        <label className="relative flex items-center cursor-pointer group" title="カスタムカラー選択">
                          <span
                            className="w-5 h-5 rounded-full border border-white/20 shrink-0 shadow-xs group-hover:scale-110 transition-transform"
                            style={{ backgroundColor: col.color || '#3b82f6' }}
                          />
                          <input
                            type="color"
                            value={col.color || '#3b82f6'}
                            onChange={(e) => handleColumnColorChange(idx, e.target.value)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                        </label>
                        <input
                          type="text"
                          value={col.title}
                          onChange={(e) => handleColumnTitleChange(idx, e.target.value)}
                          className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2.5 py-1 text-sm font-medium text-[var(--text-primary)] flex-1 outline-none"
                        />
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

                    {/* Extended Color Preset Palette */}
                    <div className="flex items-center space-x-1.5 flex-wrap pt-1 pl-7">
                      <span className="text-[11px] font-medium text-[var(--text-muted)] mr-1">カラー:</span>
                      {COLOR_PRESETS.map((colorHex) => (
                        <button
                          key={colorHex}
                          type="button"
                          onClick={() => handleColumnColorChange(idx, colorHex)}
                          className={`w-4 h-4 rounded-full transition-transform ${
                            col.color === colorHex
                              ? 'scale-125 ring-2 ring-white/80 shadow-md'
                              : 'opacity-70 hover:opacity-100 hover:scale-110'
                          }`}
                          style={{ backgroundColor: colorHex }}
                          title={colorHex}
                        />
                      ))}
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
            /* Custom Fields Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-blue-500" />
                  <span>設定済みカスタムフィールド ({localCustomFields.length})</span>
                </h3>
              </div>

              {/* List of custom fields */}
              <div className="space-y-3">
                {localCustomFields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] space-y-3 shadow-xs"
                  >
                    {/* Header with Field Name Input, Type, and Explicit FIELD DELETE Button */}
                    <div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-2.5 gap-2">
                      <div className="flex items-center space-x-2 flex-1">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => handleFieldNameChange(idx, e.target.value)}
                          className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2.5 py-1 text-sm font-bold text-[var(--text-primary)] flex-1 outline-none"
                          placeholder="フィールド名"
                        />
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                          {field.type}
                        </span>
                      </div>

                      {/* Explicit FIELD DELETE Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomField(idx)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-500 font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                        title="このカスタムフィールド自体を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>フィールド自体を削除</span>
                      </button>
                    </div>

                    {/* Dropdown Options List with color picker and individual Option Delete buttons */}
                    {field.type === 'dropdown' && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-semibold text-[var(--text-secondary)] block">
                          プルダウン選択肢（色付け設定）:
                        </span>
                        <div className="space-y-2">
                          {field.options && field.options.length > 0 ? (
                            field.options.map((opt) => (
                              <div
                                key={opt.id}
                                className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] gap-2"
                              >
                                <div className="flex items-center space-x-2 flex-1">
                                  <span
                                    className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                                    style={{ backgroundColor: opt.color || '#3b82f6' }}
                                  />
                                  <input
                                    type="text"
                                    value={opt.value}
                                    onChange={(e) => handleOptionValueChange(idx, opt.id, e.target.value)}
                                    className="bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded px-2 py-0.5 text-xs font-medium text-[var(--text-primary)] flex-1 outline-none"
                                  />
                                </div>

                                {/* Color Swatch Picker */}
                                <div className="flex items-center space-x-1 justify-end">
                                  {COLOR_PRESETS.map((colorHex) => (
                                    <button
                                      key={colorHex}
                                      type="button"
                                      onClick={() => handleOptionColorChange(idx, opt.id, colorHex)}
                                      className={`w-4 h-4 rounded-full transition-transform ${
                                        opt.color === colorHex ? 'scale-125 ring-2 ring-white/60 shadow-md' : 'hover:scale-110 opacity-70 hover:opacity-100'
                                      }`}
                                      style={{ backgroundColor: colorHex }}
                                    />
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOptionFromCustomField(idx, opt.id)}
                                    className="p-1 text-xs text-rose-500 hover:text-rose-600 font-bold ml-1"
                                    title="選択肢を削除"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] italic">選択肢が設定されていません</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const val = prompt('新しい選択肢の名前を入力してください:');
                            if (val && val.trim()) {
                              handleAddOptionToField(idx, val.trim());
                            }
                          }}
                          className="mt-2 px-3 py-1 bg-[var(--bg-surface)] hover:opacity-80 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors"
                        >
                          ＋ 選択肢を追加
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Create Custom Field Form */}
              <div className="bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-color)]/80 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-500" />
                  <span>{t('configModal.addCustomField')}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      {t('configModal.fieldTitle')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('configModal.fieldNamePlaceholder')}
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      {t('configModal.fieldType')}
                    </label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
                    >
                      <option value="dropdown">{t('configModal.typeDropdown')}</option>
                      <option value="text">{t('configModal.typeText')}</option>
                      <option value="number">{t('configModal.typeNumber')}</option>
                      <option value="date">{t('configModal.typeDate')}</option>
                      <option value="checkbox">{t('configModal.typeCheckbox')}</option>
                    </select>
                  </div>
                </div>

                {newFieldType === 'dropdown' && (
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      {t('configModal.addOption')} ({t('configModal.optionPlaceholder')})
                    </label>
                    <input
                      type="text"
                      placeholder={t('configModal.optionPlaceholder')}
                      value={newFieldOptionsInput}
                      onChange={(e) => setNewFieldOptionsInput(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] focus:border-blue-500 rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    disabled={!newFieldName.trim()}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors"
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
