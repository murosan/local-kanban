import React, { useState, useEffect } from 'react';
import { ThemeConfig } from '../types/task';
import { useI18n } from '../i18n/I18nContext';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: ThemeConfig;
  onSelectTheme: (theme: ThemeConfig) => void;
}

export const PRESET_THEMES: { id: string; nameKey: string; primaryBg: string; cardBg: string; accentColor: string; textColor: string }[] = [
  { id: 'dark', nameKey: 'preset.dark', primaryBg: '#0b0f19', cardBg: '#1f293d', accentColor: '#3b82f6', textColor: '#f8fafc' },
  { id: 'dim-dark', nameKey: 'preset.dimDark', primaryBg: '#1f2937', cardBg: '#252e3d', accentColor: '#38bdf8', textColor: '#f9fafb' },
  { id: 'midnight', nameKey: 'preset.midnight', primaryBg: '#0a0e1a', cardBg: '#1e293b', accentColor: '#6366f1', textColor: '#f1f5f9' },
  { id: 'cyberpunk', nameKey: 'preset.cyberpunk', primaryBg: '#120024', cardBg: '#2a004f', accentColor: '#ff007f', textColor: '#00f0ff' },
  { id: 'forest', nameKey: 'preset.forest', primaryBg: '#061712', cardBg: '#14352b', accentColor: '#10b981', textColor: '#ecfdf5' },
  { id: 'light', nameKey: 'preset.light', primaryBg: '#f8fafc', cardBg: '#ffffff', accentColor: '#2563eb', textColor: '#0f172a' },
  { id: 'dim-light', nameKey: 'preset.dimLight', primaryBg: '#94a3b8', cardBg: '#bfcbda', accentColor: '#2563eb', textColor: '#0f172a' },
];

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  const { t } = useI18n();
  const [selectedPreset, setSelectedPreset] = useState<string>(() => currentTheme?.name || 'dark');
  const [customPrimaryBg, setCustomPrimaryBg] = useState<string>(() => currentTheme?.primaryBg || '#0b0f19');
  const [customCardBg, setCustomCardBg] = useState<string>(() => currentTheme?.cardBg || '#1f293d');
  const [customAccent, setCustomAccent] = useState<string>(() => currentTheme?.accentColor || '#3b82f6');
  const [customText, setCustomText] = useState<string>(() => currentTheme?.textColor || '#f8fafc');
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

  const handleApplyPreset = (preset: typeof PRESET_THEMES[0]) => {
    setSelectedPreset(preset.id);
    const themeConfig: ThemeConfig = {
      name: preset.id,
      primaryBg: preset.primaryBg,
      cardBg: preset.cardBg,
      accentColor: preset.accentColor,
      textColor: preset.textColor,
    };
    onSelectTheme(themeConfig);
  };

  const handleApplyCustom = () => {
    setSelectedPreset('custom');
    const themeConfig: ThemeConfig = {
      name: 'custom',
      primaryBg: customPrimaryBg,
      cardBg: customCardBg,
      accentColor: customAccent,
      textColor: customText,
    };
    onSelectTheme(themeConfig);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-3 animate-fade-in">
      <div className={`bg-[var(--modal-bg)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full overflow-hidden flex flex-col transition-all duration-300 ${
        isMaximized ? 'w-[98vw] h-[96vh] max-w-none max-h-none' : 'max-w-3xl h-[88vh]'
      }`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <span>🎨</span>
            <span>{t('themeModal.title')}</span>
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

        {/* Modal Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Preset Themes Grid */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              {t('themeModal.presetThemes')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PRESET_THEMES.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset)}
                    className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-500/10'
                        : 'border-[var(--border-color)] hover:opacity-90 bg-[var(--bg-card)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{t(preset.nameKey)}</span>
                      {isSelected && <span className="text-blue-500 text-xs font-semibold">{t('themeModal.active')}</span>}
                    </div>
                    {/* Color Swatch Preview */}
                    <div className="flex space-x-1.5 pt-1">
                      <div className="w-5 h-5 rounded-full border border-slate-400/40 shadow-sm" style={{ backgroundColor: preset.primaryBg }} title="Primary BG" />
                      <div className="w-5 h-5 rounded-full border border-slate-400/40 shadow-sm" style={{ backgroundColor: preset.cardBg }} title="Card BG" />
                      <div className="w-5 h-5 rounded-full border border-slate-400/40 shadow-sm" style={{ backgroundColor: preset.accentColor }} title="Accent" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Color Picker Section */}
          <div className="pt-4 border-t border-[var(--border-color)]">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
              {t('themeModal.customPalette')}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('themeModal.background')}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={customPrimaryBg}
                    onChange={(e) => setCustomPrimaryBg(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent"
                  />
                  <span className="text-xs font-mono text-[var(--text-primary)]">{customPrimaryBg}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('themeModal.cardBackground')}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={customCardBg}
                    onChange={(e) => setCustomCardBg(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent"
                  />
                  <span className="text-xs font-mono text-[var(--text-primary)]">{customCardBg}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('themeModal.accentColor')}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={customAccent}
                    onChange={(e) => setCustomAccent(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent"
                  />
                  <span className="text-xs font-mono text-[var(--text-primary)]">{customAccent}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">{t('themeModal.textColor')}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent"
                  />
                  <span className="text-xs font-mono text-[var(--text-primary)]">{customText}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleApplyCustom}
              className="mt-4 w-full py-2 px-4 bg-[var(--bg-card)] hover:opacity-90 border border-[var(--border-color)] rounded-lg text-sm font-medium transition-colors text-[var(--text-primary)]"
            >
              {t('themeModal.applyCustom')}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('themeModal.done')}
          </button>
        </div>
      </div>
    </div>
  );
};
