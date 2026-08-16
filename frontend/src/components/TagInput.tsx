import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Tag, X } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import {
  getTagSuggestions,
  addTagIfUnique,
  removeTagAtIndex,
  addMultipleTags,
  parseTags,
} from '../utils/tag';

export interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags = [],
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

  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Compute suggestions based on current draft and availableTags (excluding already selected tags)
  const suggestions = useMemo(() => {
    return getTagSuggestions(availableTags, draft, tags);
  }, [availableTags, draft, tags]);

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

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    const nextTags = addTagIfUnique(tags, trimmed);
    if (nextTags !== tags) {
      onChange(nextTags);
    }
    setDraft('');
    setSelectedIndex(-1);
    setIsOpen(false);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 10);
  };

  const handleRemoveTag = (index: number) => {
    const nextTags = removeTagAtIndex(tags, index);
    onChange(nextTags);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 10);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // If comma was typed directly in onChange (e.g. mobile/paste)
    if (val.includes(',')) {
      const parts = parseTags(val);
      if (parts.length > 0) {
        onChange(addMultipleTags(tags, parts));
      }
      setDraft('');
      setIsOpen(false);
      return;
    }
    setDraft(val);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore keydown during IME composition
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
        setSelectedIndex(0);
      } else if (suggestions.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
        setSelectedIndex(suggestions.length - 1);
      } else if (suggestions.length > 0) {
        setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
      return;
    }

    if (e.key === 'Tab') {
      if (isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        handleAddTag(suggestions[selectedIndex]);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleAddTag(suggestions[selectedIndex]);
      } else if (draft.trim()) {
        handleAddTag(draft);
      }
      return;
    }

    if (e.key === ',') {
      e.preventDefault();
      if (draft.trim()) {
        handleAddTag(draft);
      }
      return;
    }

    if (e.key === 'Backspace') {
      if (draft === '' && tags.length > 0) {
        e.preventDefault();
        handleRemoveTag(tags.length - 1);
      }
      return;
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes(',') || text.includes('\n')) {
      e.preventDefault();
      const parts = parseTags(text);
      if (parts.length > 0) {
        onChange(addMultipleTags(tags, parts));
      }
      setDraft('');
      setIsOpen(false);
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  const handleContainerClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const highlightMatch = (text: string, query: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + q.length);
    const after = text.substring(idx + q.length);
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
      {/* Chip and Input Container */}
      <div
        onClick={handleContainerClick}
        className={`flex flex-wrap items-center gap-1.5 px-3 py-1.5 min-h-[42px] bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-text'
        }`}
      >
        {/* Render Tag Chips */}
        {tags.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg shadow-sm group select-none animate-in fade-in duration-100"
          >
            <Tag className="w-3 h-3 text-blue-400 shrink-0" />
            <span className="truncate max-w-[180px]">{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveTag(idx);
                }}
                className="p-0.5 rounded hover:bg-blue-500/20 text-blue-400/70 hover:text-blue-300 transition-colors cursor-pointer"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* Draft Input */}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={handleInputFocus}
          placeholder={tags.length === 0 ? placeholder || t('taskModal.tagsPlaceholder') : ''}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-haspopup="listbox"
          className="flex-1 min-w-[130px] bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] py-1 px-1 font-medium"
        />
      </div>

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
                    handleAddTag(suggestion);
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
                    <span className="truncate">{highlightMatch(suggestion, draft)}</span>
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
  );
};
