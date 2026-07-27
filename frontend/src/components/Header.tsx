import React from 'react';
import { RefreshCw, Plus, Search, Kanban, Palette, Settings, Globe } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onReload: () => void;
  onOpenNewTaskModal: () => void;
  onOpenThemeModal: () => void;
  onOpenColumnManagerModal: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onReload,
  onOpenNewTaskModal,
  onOpenThemeModal,
  onOpenColumnManagerModal,
  isSyncing,
}) => {
  const { language, setLanguage, t } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'ja' ? 'en' : 'ja');
  };

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-[var(--border-color)] px-6 py-3.5 mb-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 text-white">
            <Kanban className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)]">
              {t('header.title')}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] font-medium font-sans">{t('header.subtitle')}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('header.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-lg transition-all active:scale-95"
            title="Switch Language (日本語 / English)"
          >
            <Globe className="w-3.5 h-3.5 text-blue-500" />
            <span>{language.toUpperCase()}</span>
          </button>

          {/* Theme Settings Button */}
          <button
            onClick={onOpenThemeModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-lg transition-all active:scale-95"
            title={t('header.theme')}
          >
            <Palette className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="hidden sm:inline">{t('header.theme')}</span>
          </button>

          {/* Board Config Button */}
          <button
            onClick={onOpenColumnManagerModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-lg transition-all active:scale-95"
            title={t('header.columns')}
          >
            <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="hidden sm:inline">{t('header.columns')}</span>
          </button>

          {/* Sync Button */}
          <button
            onClick={onReload}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-lg transition-all active:scale-95 disabled:opacity-50"
            title={t('header.sync')}
          >
            <RefreshCw className={`w-4 h-4 text-[var(--text-secondary)] ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('header.sync')}</span>
          </button>

          {/* New Task Button */}
          <button
            onClick={onOpenNewTaskModal}
            className="flex items-center space-x-2 px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="whitespace-nowrap">{t('header.newTask')}</span>
          </button>
        </div>

      </div>
    </header>
  );
};
