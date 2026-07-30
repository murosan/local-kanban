import React from 'react';
import { RefreshCw, Search, Palette, Settings, Globe } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onReload: () => void;
  onOpenThemeModal: () => void;
  onOpenColumnManagerModal: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onReload,
  onOpenThemeModal,
  onOpenColumnManagerModal,
  isSyncing,
}) => {
  const { language, setLanguage, t } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'ja' ? 'en' : 'ja');
  };

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-[var(--border-color)] px-4 py-2 mb-2">
      <div className="w-full flex flex-col md:flex-row items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center space-x-2">
          <img
            src="/icons/icon.svg"
            alt="LocalKanban"
            className="w-6 h-6 rounded-md shadow-sm border border-[var(--border-color)]"
          />
          <div className="flex items-baseline space-x-2">
            <h1 className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] leading-none">
              {t('header.title')}
            </h1>
            <span className="text-[11px] text-[var(--text-secondary)] font-medium hidden sm:inline leading-none">
              {t('header.subtitle')}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-1.5 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('header.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-md text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center space-x-1 px-2 py-1 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-md transition-all active:scale-95"
            title="Switch Language (日本語 / English)"
          >
            <Globe className="w-3 h-3 text-blue-500" />
            <span>{language.toUpperCase()}</span>
          </button>

          {/* Theme Settings Button */}
          <button
            onClick={onOpenThemeModal}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-md transition-all active:scale-95"
            title={t('header.theme')}
          >
            <Palette className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span className="hidden sm:inline">{t('header.theme')}</span>
          </button>

          {/* Board Config Button */}
          <button
            onClick={onOpenColumnManagerModal}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-md transition-all active:scale-95"
            title={t('header.columns')}
          >
            <Settings className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span className="hidden sm:inline">{t('header.columns')}</span>
          </button>

          {/* Sync Button */}
          <button
            onClick={onReload}
            disabled={isSyncing}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-card)] hover:opacity-80 border border-[var(--border-color)] rounded-md transition-all active:scale-95 disabled:opacity-50"
            title={t('header.sync')}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">{t('header.sync')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
