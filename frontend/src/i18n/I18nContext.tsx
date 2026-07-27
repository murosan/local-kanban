import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations } from './translations';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ initialLanguage?: string; children: ReactNode }> = ({
  initialLanguage,
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('localkanban_lang');
    if (saved === 'ja' || saved === 'en') return saved;
    if (initialLanguage === 'ja' || initialLanguage === 'en') return initialLanguage;
    return 'ja';
  });

  useEffect(() => {
    if (initialLanguage === 'ja' || initialLanguage === 'en') {
      setLanguageState(initialLanguage);
    }
  }, [initialLanguage]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('localkanban_lang', lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    const dict = translations[language] || translations.ja;
    let text = (dict as Record<string, string>)[key] || (translations.ja as Record<string, string>)[key] || key;

    if (params) {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramVal);
      });
    }

    return text;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
