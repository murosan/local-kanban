import React, { useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Language, translations } from './translations';
import { I18nContext } from './I18nContext';

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

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState((prev) => {
      if (prev === lang) return prev;
      localStorage.setItem('localkanban_lang', lang);
      return lang;
    });
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const dict = translations[language] || translations.ja;
      let text =
        (dict as Record<string, string>)[key] ||
        (translations.ja as Record<string, string>)[key] ||
        key;

      if (params) {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramVal);
        });
      }

      return text;
    },
    [language]
  );

  const contextValue = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
};
