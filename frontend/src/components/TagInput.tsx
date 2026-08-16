import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Tag } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import {
  getActiveTokenInfo,
  getExistingTags,
  getTagSuggestions,
  computeNextTagValueWithCursor,
} from '../utils/tag';

export interface TagInputProps {
  value: string;
  onChange: (value: string) => void;
  availableTags?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  availableTags = [],
  placeholder,
  className = '',
  disabled = false,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [cursorPos, setCursorPos] = useState<number>(0);

  const activeTokenInfo = useMemo(() => {
    return getActiveTokenInfo(value, cursorPos);
  }, [value, cursorPos]);

  // Existing tags excluding the active token being edited (so they won't be suggested)
  const existingTags = useMemo(() => {
    return getExistingTags(value, activeTokenInfo);
  }, [value, activeTokenInfo]);

  // Compute suggestions based on active token and availableTags (excluding existing tags)
  const suggestions = useMemo(() => {
    return getTagSuggestions(availableTags, activeTokenInfo.token, existingTags);
  }, [availableTags, activeTokenInfo.token, existingTags]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (suggestions.length === 0) return -1;
      if (prev >= suggestions.length) return suggestions.length - 1;
      return prev;
    });
  }, [suggestions]);

  // Auto scroll highlighted suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectSuggestion = (tagToInsert: string) => {
    const { nextValue, nextCursorPos } = computeNextTagValueWithCursor(
      value,
      activeTokenInfo,
      tagToInsert
    );
    onChange(nextValue);
    setCursorPos(nextCursorPos);
    setIsOpen(false);
    setSelectedIndex(-1);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    }, 10);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    const newPos = e.target.selectionStart ?? newVal.length;
    setCursorPos(newPos);
    onChange(newVal);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore keydown during IME composition
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setSelectedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        break;
      case 'Tab':
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          e.stopPropagation();
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        break;
    }
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const pos = e.target.selectionStart ?? value.length;
    setCursorPos(pos);
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    setCursorPos(input.selectionStart ?? value.length);
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') {
      const input = e.currentTarget;
      setCursorPos(input.selectionStart ?? value.length);
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + query.length);
    const after = text.substring(idx + query.length);
    return (
      <>
        {before}
        <span className="font-bold text-blue-400 underline decoration-blue-400/40">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col space-y-1.5 ${className}`}>
      {/* Input container */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyUp={handleInputKeyUp}
          placeholder={placeholder || t('taskModal.tagsPlaceholder')}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-haspopup="listbox"
          className="w-full px-3.5 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
        />

        {/* Suggestion Dropdown */}
        {isOpen && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl backdrop-blur-md overflow-hidden animate-fade-in max-h-56 flex flex-col">
            <div className="px-3 py-1.5 border-b border-[var(--border-color)]/60 flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-blue-400" />
                {t('taskModal.tagSuggestions')}
              </span>
              <span className="text-[10px] opacity-75">{t('taskModal.tagSuggestionsHint')}</span>
            </div>

            <ul
              ref={listRef}
              role="listbox"
              className="py-1 overflow-y-auto max-h-48 divide-y divide-[var(--border-color)]/20"
            >
              {suggestions.map((suggestion, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <li
                    key={suggestion}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      // Prevent input blur before click handler
                      e.preventDefault();
                      handleSelectSuggestion(suggestion);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-500/15 text-blue-400 font-medium'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Tag
                        className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}
                      />
                      <span className="truncate">
                        {highlightMatch(suggestion, activeTokenInfo.token)}
                      </span>
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] group-hover:text-blue-400 font-mono">
                      + add
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
