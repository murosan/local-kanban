import React, { useState, useRef, useLayoutEffect, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Prism from 'prismjs';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Table as TableIcon,
  Link as LinkIcon,
  Minus,
  Clock,
  Edit3,
  Columns,
  Eye,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Undo,
  Redo,
  ListTree,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/useI18n';
import { extractHeadings, TocItem } from '../utils/toc';

export interface ChangeOptions {
  immediate?: boolean;
  selectionStart?: number;
  selectionEnd?: number;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string, options?: ChangeOptions) => void;
  placeholder?: string;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

type Mode = 'edit' | 'split' | 'preview';

const EDITOR_MODE_KEY = 'localkanban_editor_mode';
const EDITOR_TOC_KEY = 'localkanban_editor_toc_open';

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const { t } = useI18n();
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem(EDITOR_MODE_KEY);
      if (saved === 'edit' || saved === 'split' || saved === 'preview') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'edit';
  });

  const [isTocOpen, setIsTocOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(EDITOR_TOC_KEY);
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // ignore
    }
    return false;
  });

  const handleToggleToc = () => {
    setIsTocOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EDITOR_TOC_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const headings = useMemo(() => extractHeadings(value), [value]);
  const previewRef = useRef<HTMLDivElement>(null);
  const tocListRef = useRef<HTMLDivElement>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // Auto-scroll TOC sidebar to keep the active heading item in view
  useEffect(() => {
    if (activeHeadingId && tocListRef.current) {
      const activeEl = tocListRef.current.querySelector<HTMLElement>(
        `[data-toc-id="${activeHeadingId}"]`
      );
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeHeadingId]);

  // Active section tracking (Scrollspy) on preview pane
  useEffect(() => {
    if (mode === 'edit' || !previewRef.current || headings.length === 0) return;

    const container = previewRef.current;
    const handleScroll = () => {
      // Check if scrolled near the bottom of container
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 30) {
        setActiveHeadingId(headings[headings.length - 1].id);
        return;
      }

      const containerTop = container.getBoundingClientRect().top;
      let currentActive: string | null = headings[0]?.id || null;

      for (const h of headings) {
        const el =
          container.querySelector<HTMLElement>(`[data-heading-id="${h.id}"]`) ||
          container.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top - containerTop <= 100) {
            currentActive = h.id;
          } else {
            break;
          }
        }
      }
      setActiveHeadingId(currentActive);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [mode, headings, value]);

  const handleJumpToHeading = (item: TocItem) => {
    setActiveHeadingId(item.id);

    if (mode === 'edit') {
      if (textareaRef.current && item.lineNumber) {
        const lines = value.split('\n');
        let charPos = 0;
        for (let i = 0; i < item.lineNumber - 1 && i < lines.length; i++) {
          charPos += lines[i].length + 1;
        }
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          charPos,
          charPos + (lines[item.lineNumber - 1]?.length || 0)
        );
        const lineHeight = 24;
        textareaRef.current.scrollTop = Math.max(0, (item.lineNumber - 3) * lineHeight);
      }
      return;
    }

    if (previewRef.current) {
      const targetEl =
        previewRef.current.querySelector<HTMLElement>(`[data-heading-id="${item.id}"]`) ||
        previewRef.current.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`) ||
        previewRef.current.querySelector<HTMLElement>(`[id="${item.id}"]`);

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        targetEl.classList.remove('heading-highlight');
        void targetEl.offsetWidth; // Force reflow to re-trigger css animation
        targetEl.classList.add('heading-highlight');
        setTimeout(() => {
          targetEl.classList.remove('heading-highlight');
        }, 2000);
      }
    }

    if (mode === 'split' && textareaRef.current && item.lineNumber) {
      const lines = value.split('\n');
      let charPos = 0;
      for (let i = 0; i < item.lineNumber - 1 && i < lines.length; i++) {
        charPos += lines[i].length + 1;
      }
      textareaRef.current.setSelectionRange(charPos, charPos);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    try {
      localStorage.setItem(EDITOR_MODE_KEY, newMode);
    } catch {
      // ignore
    }
  };

  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    if (pendingSelectionRef.current && textareaRef.current) {
      const { start, end } = pendingSelectionRef.current;
      textareaRef.current.setSelectionRange(start, end);
      pendingSelectionRef.current = null;
    }
  }, [value]);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const insertFormat = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = `${before}${selectedText}${after}`;

    const newValue = value.substring(0, start) + replacement + value.substring(end);
    const newStart = start + before.length;
    const newEnd = start + before.length + selectedText.length;
    pendingSelectionRef.current = { start: newStart, end: newEnd };
    onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });
  };

  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Find beginning and end of current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = value.indexOf('\n', start);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const currentLine = value.substring(lineStart, lineEnd);

    // Common prefix patterns (headings, check lists, bullet lists, ordered lists, blockquotes)
    const prefixPatterns = [
      /^#{1,6}\s+/,
      /^[-*+]\s+\[[ xX]\]\s+/,
      /^[-*+]\s+/,
      /^\d+\.\s+/,
      /^>\s+/,
    ];

    let existingPrefix = '';
    for (const pattern of prefixPatterns) {
      const match = currentLine.match(pattern);
      if (match) {
        existingPrefix = match[0];
        break;
      }
    }

    let newLine = currentLine;
    if (existingPrefix && currentLine.startsWith(prefix)) {
      // Toggle off if clicking the same prefix
      newLine = currentLine.substring(prefix.length);
    } else if (existingPrefix) {
      // Replace existing prefix with new prefix
      newLine = prefix + currentLine.substring(existingPrefix.length);
    } else {
      // Add prefix
      newLine = prefix + currentLine;
    }

    const newValue = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
    const lengthDiff = newLine.length - currentLine.length;
    const newStart = Math.max(lineStart, start + lengthDiff);
    const newEnd = Math.max(lineStart, end + lengthDiff);

    pendingSelectionRef.current = { start: newStart, end: newEnd };
    onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });
  };

  const insertTimestamp = () => {
    const now = new Date();
    const formatted = now.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    insertFormat(`\`${formatted}\` `);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod) {
      if (!e.nativeEvent.isComposing) {
        if (e.key === 'z' || e.key === 'Z') {
          if (onUndo && onRedo) {
            e.preventDefault();
            if (e.shiftKey) {
              onRedo();
            } else {
              onUndo();
            }
            return;
          }
        }
        if (e.key === 'y' || e.key === 'Y') {
          if (onRedo) {
            e.preventDefault();
            onRedo();
            return;
          }
        }
      }

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        insertFormat('**', '**', '太字');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        insertFormat('*', '*', '斜体');
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        insertFormat('[', '](https://example.com)', 'リンクテキスト');
        return;
      }
    }

    if (e.key === 'Tab') {
      if (e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineText = value.substring(lineStart, end);
        if (lineText.startsWith('  ')) {
          const newValue =
            value.substring(0, lineStart) + lineText.substring(2) + value.substring(end);
          const newStart = Math.max(lineStart, start - 2);
          const newEnd = Math.max(lineStart, end - 2);
          pendingSelectionRef.current = { start: newStart, end: newEnd };
          onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });
        }
      } else {
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        const newStart = start + 2;
        const newEnd = end + 2;
        pendingSelectionRef.current = { start: newStart, end: newEnd };
        onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });
      }
      return;
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start === end) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineText = value.substring(lineStart, start);

        const taskMatch = lineText.match(/^(\s*[-*+]\s+\[[ xX]\]\s*)(.*)$/);
        const bulletMatch = lineText.match(/^(\s*[-*+]\s+)(.*)$/);
        const numberMatch = lineText.match(/^(\s*)(\d+)\.\s+(.*)$/);
        const quoteMatch = lineText.match(/^(\s*>\s*)(.*)$/);

        if (taskMatch) {
          e.preventDefault();
          const [, prefix, rest] = taskMatch;
          if (rest.trim() === '') {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            pendingSelectionRef.current = { start: lineStart, end: lineStart };
            onChange(newValue, {
              immediate: true,
              selectionStart: lineStart,
              selectionEnd: lineStart,
            });
          } else {
            const newPrefix = '\n' + prefix.replace(/\[[xX]\]/, '[ ]');
            const newValue = value.substring(0, start) + newPrefix + value.substring(start);
            const nextPos = start + newPrefix.length;
            pendingSelectionRef.current = { start: nextPos, end: nextPos };
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
          }
          return;
        }

        if (bulletMatch) {
          e.preventDefault();
          const [, prefix, rest] = bulletMatch;
          if (rest.trim() === '') {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            pendingSelectionRef.current = { start: lineStart, end: lineStart };
            onChange(newValue, {
              immediate: true,
              selectionStart: lineStart,
              selectionEnd: lineStart,
            });
          } else {
            const newPrefix = '\n' + prefix;
            const newValue = value.substring(0, start) + newPrefix + value.substring(start);
            const nextPos = start + newPrefix.length;
            pendingSelectionRef.current = { start: nextPos, end: nextPos };
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
          }
          return;
        }

        if (numberMatch) {
          e.preventDefault();
          const [, indent, numStr, restBefore] = numberMatch;
          const lineEndIndex = value.indexOf('\n', start);
          const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
          const beforeCursor = value.substring(lineStart, start);
          const afterCursor = value.substring(start, lineEnd);
          const isLineEmptyItem = restBefore.trim() === '' && afterCursor.trim() === '';

          const lines = value.split('\n');

          // Find current line index in lines array
          let currentLineIdx = 0;
          let charAccumulator = 0;
          for (let i = 0; i < lines.length; i++) {
            if (charAccumulator + lines[i].length >= lineStart) {
              currentLineIdx = i;
              break;
            }
            charAccumulator += lines[i].length + 1;
          }

          const escapedIndent = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const numberItemRegex = new RegExp(`^(${escapedIndent})(\\d+)\\.\\s+(.*)$`);

          if (isLineEmptyItem) {
            lines[currentLineIdx] = '';

            for (let k = currentLineIdx + 1; k < lines.length; k++) {
              const match = lines[k].match(numberItemRegex);
              if (match) {
                const subNum = parseInt(match[2], 10);
                lines[k] = `${indent}${subNum - 1}. ${match[3]}`;
              } else if (lines[k].trim() === '') {
                continue;
              } else {
                const nextIndentMatch = lines[k].match(/^(\s*)/);
                const nextIndent = nextIndentMatch ? nextIndentMatch[1] : '';
                if (nextIndent.length > indent.length) {
                  continue;
                } else {
                  break;
                }
              }
            }

            const newValue = lines.join('\n');
            pendingSelectionRef.current = { start: lineStart, end: lineStart };
            onChange(newValue, {
              immediate: true,
              selectionStart: lineStart,
              selectionEnd: lineStart,
            });
          } else {
            const nextNum = parseInt(numStr, 10) + 1;
            const restAfterTrimmed = afterCursor.trimStart();
            const newPrefix = `${indent}${nextNum}. `;

            lines[currentLineIdx] = beforeCursor;
            lines.splice(currentLineIdx + 1, 0, `${newPrefix}${restAfterTrimmed}`);

            for (let k = currentLineIdx + 2; k < lines.length; k++) {
              const match = lines[k].match(numberItemRegex);
              if (match) {
                const subNum = parseInt(match[2], 10);
                lines[k] = `${indent}${subNum + 1}. ${match[3]}`;
              } else if (lines[k].trim() === '') {
                continue;
              } else {
                const nextIndentMatch = lines[k].match(/^(\s*)/);
                const nextIndent = nextIndentMatch ? nextIndentMatch[1] : '';
                if (nextIndent.length > indent.length) {
                  continue;
                } else {
                  break;
                }
              }
            }

            const newValue = lines.join('\n');
            const nextPos = start + 1 + newPrefix.length;
            pendingSelectionRef.current = { start: nextPos, end: nextPos };
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
          }
          return;
        }

        if (quoteMatch) {
          e.preventDefault();
          const [, prefix, rest] = quoteMatch;
          if (rest.trim() === '') {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            pendingSelectionRef.current = { start: lineStart, end: lineStart };
            onChange(newValue, {
              immediate: true,
              selectionStart: lineStart,
              selectionEnd: lineStart,
            });
          } else {
            const newPrefix = '\n' + prefix;
            const newValue = value.substring(0, start) + newPrefix + value.substring(start);
            const nextPos = start + newPrefix.length;
            pendingSelectionRef.current = { start: nextPos, end: nextPos };
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
          }
          return;
        }
      }
    }
  };

  const highlightCode = (code: string, language: string) => {
    const normalizedLang = (language || '').toLowerCase();
    const grammar =
      Prism.languages[normalizedLang] || Prism.languages.javascript || Prism.languages.clike;
    if (!grammar) return code;
    try {
      return Prism.highlight(code, grammar, normalizedLang);
    } catch {
      return code;
    }
  };

  const handleToggleTaskByLineNumber = (lineNum?: number) => {
    if (!lineNum || lineNum <= 0) return;
    const lines = value.split('\n');
    let targetIdx = lineNum - 1;

    if (targetIdx >= 0 && targetIdx < lines.length) {
      let match = lines[targetIdx].match(/^(\s*(?:[-*+]|\d+|>)*\s*[-*+]?\s*\[)([ xX])(\]\s*.*)$/);

      if (!match) {
        for (const offset of [-1, 1, -2, 2, -3, 3]) {
          const idx = targetIdx + offset;
          if (idx >= 0 && idx < lines.length) {
            const nearMatch = lines[idx].match(
              /^(\s*(?:[-*+]|\d+|>)*\s*[-*+]?\s*\[)([ xX])(\]\s*.*)$/
            );
            if (nearMatch) {
              targetIdx = idx;
              match = nearMatch;
              break;
            }
          }
        }
      }

      if (match) {
        const nextMark = match[2] === ' ' ? 'x' : ' ';
        lines[targetIdx] = `${match[1]}${nextMark}${match[3]}`;
        onChange(lines.join('\n'), { immediate: true });
      }
    }
  };

  return (
    <div
      className={`flex flex-col flex-1 border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-input)] transition-all ${
        isFocusMode
          ? 'fixed inset-2 sm:inset-4 z-50 shadow-2xl bg-[var(--modal-bg)]'
          : 'min-h-[420px]'
      }`}
    >
      {/* Editor Header / Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[var(--bg-surface)] border-b border-[var(--border-color)] select-none">
        {/* Mode Switcher */}
        <div className="flex items-center space-x-1 p-0.5 bg-[var(--bg-input)] rounded-lg border border-[var(--border-color)]">
          <button
            type="button"
            onClick={() => handleModeChange('edit')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              mode === 'edit'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{t('editor.modeEdit')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('split')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              mode === 'split'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{t('editor.modeSplit')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('preview')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              mode === 'preview'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{t('editor.modePreview')}</span>
          </button>
        </div>

        {/* Formatting Actions Toolbar (Visible in Edit & Split mode) */}
        {mode !== 'preview' && (
          <div className="flex items-center flex-wrap gap-1">
            {(onUndo || onRedo) && (
              <div className="flex items-center space-x-0.5 border-r border-[var(--border-color)] pr-1.5 mr-1">
                {onUndo && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    title="元に戻す (Cmd+Z / Ctrl+Z)"
                  >
                    <Undo className="w-4 h-4" />
                  </button>
                )}
                {onRedo && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    title="やり直す (Cmd+Shift+Z / Ctrl+Y)"
                  >
                    <Redo className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center space-x-0.5 border-r border-[var(--border-color)] pr-1.5 mr-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('# ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.h1')}
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('## ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.h2')}
              >
                <Heading2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('### ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.h3')}
              >
                <Heading3 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-0.5 border-r border-[var(--border-color)] pr-1.5 mr-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertFormat('**', '**', '太字')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.bold')}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertFormat('*', '*', '斜体')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.italic')}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertFormat('~~', '~~', '打ち消し')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.strikethrough')}
              >
                <Strikethrough className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-0.5 border-r border-[var(--border-color)] pr-1.5 mr-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('- ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.bulletList')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('1. ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.numberList')}
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('- [ ] ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.checkList')}
              >
                <CheckSquare className="w-4 h-4 text-blue-400" />
              </button>
            </div>

            <div className="flex items-center space-x-0.5 border-r border-[var(--border-color)] pr-1.5 mr-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertLinePrefix('> ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.quote')}
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertFormat('\n```javascript\n', '\n```\n', '// code here')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.codeBlock')}
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  insertFormat(
                    '\n| ヘッダー 1 | ヘッダー 2 |\n| --- | --- |\n| セル 1 | セル 2 |\n'
                  )
                }
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.table')}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertFormat('[', '](https://example.com)', 'リンクテキスト')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.link')}
              >
                <LinkIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertFormat('\n---\n')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.horizontalRule')}
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertTimestamp}
              className="p-1.5 text-[var(--text-secondary)] hover:text-blue-400 hover:bg-[var(--border-color)]/40 rounded-lg transition-colors flex items-center space-x-1"
              title={t('editor.timestamp')}
            >
              <Clock className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right Toolbar Actions */}
        <div className="flex items-center space-x-1">
          {/* Table of Contents Toggle */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleToc}
            className={`px-2 py-1 rounded-lg transition-colors flex items-center space-x-1.5 text-xs font-semibold ${
              isTocOpen
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
            }`}
            title={t('editor.tocToggle')}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('editor.toc')}</span>
            {headings.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                  isTocOpen
                    ? 'bg-blue-500/30 text-blue-300'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)]'
                }`}
              >
                {headings.length}
              </span>
            )}
          </button>

          {/* Focus Mode Fullscreen Toggle */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`px-2 py-1 rounded-lg transition-colors flex items-center space-x-1 text-xs font-semibold ${
              isFocusMode
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
            }`}
            title={isFocusMode ? 'フォーカス表示解除' : '編集画面いっぱいに拡大 (フォーカス表示)'}
          >
            {isFocusMode ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{isFocusMode ? '戻す' : '全画面拡大'}</span>
          </button>

          {/* Copy Markdown button */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopy}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
            title="Markdownをコピー"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex min-h-[350px] overflow-hidden">
        {/* Editor Textarea */}
        {(mode === 'edit' || mode === 'split') && (
          <div
            className={`flex-1 flex flex-col h-full ${mode === 'split' ? 'w-1/2 border-r border-[var(--border-color)]' : 'w-full'}`}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) =>
                onChange(e.target.value, {
                  selectionStart: e.target.selectionStart,
                  selectionEnd: e.target.selectionEnd,
                })
              }
              onKeyDown={handleKeyDown}
              onSelect={() => {
                if (textareaRef.current && headings.length > 0) {
                  const cursorPos = textareaRef.current.selectionStart;
                  const textBeforeCursor = value.substring(0, cursorPos);
                  const currentLine = textBeforeCursor.split('\n').length;
                  let active = headings[0]?.id || null;
                  for (const h of headings) {
                    if (h.lineNumber <= currentLine) {
                      active = h.id;
                    } else {
                      break;
                    }
                  }
                  setActiveHeadingId(active);
                }
              }}
              onClick={() => {
                if (textareaRef.current && headings.length > 0) {
                  const cursorPos = textareaRef.current.selectionStart;
                  const textBeforeCursor = value.substring(0, cursorPos);
                  const currentLine = textBeforeCursor.split('\n').length;
                  let active = headings[0]?.id || null;
                  for (const h of headings) {
                    if (h.lineNumber <= currentLine) {
                      active = h.id;
                    } else {
                      break;
                    }
                  }
                  setActiveHeadingId(active);
                }
              }}
              placeholder={placeholder || 'Markdown形式で入力...'}
              className="w-full flex-1 h-full p-4 pb-48 sm:pb-64 bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-mono text-sm leading-relaxed resize-none overflow-y-auto"
            />
          </div>
        )}

        {/* Rich Preview Area */}
        {(mode === 'preview' || mode === 'split') && (
          <div
            ref={previewRef}
            className={`flex-1 h-full p-5 pb-48 sm:pb-64 overflow-y-auto bg-[var(--bg-input)] ${mode === 'split' ? 'w-1/2' : 'w-full'}`}
          >
            {value.trim() ? (
              <div className="markdown-preview">
                {(() => {
                  let headingRenderIndex = 0;

                  const renderHeading = (
                    level: number,
                    Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
                  ) => {
                    return ({
                      node,
                      children,
                      className,
                      ...props
                    }: React.HTMLAttributes<HTMLHeadingElement> & {
                      node?: { position?: { start?: { line?: number } } };
                    }) => {
                      const lineNum = node?.position?.start?.line;
                      let matchedItem: TocItem | undefined;

                      if (lineNum) {
                        matchedItem = headings.find(
                          (h) => h.lineNumber === lineNum && h.level === level
                        );
                      }

                      if (!matchedItem && headingRenderIndex < headings.length) {
                        const current = headings[headingRenderIndex];
                        if (current && current.level === level) {
                          matchedItem = current;
                          headingRenderIndex++;
                        } else {
                          matchedItem = headings.find((h) => h.level === level);
                        }
                      }

                      const headingId = matchedItem?.id;

                      return (
                        <Tag
                          id={headingId}
                          data-heading-id={headingId}
                          data-heading-line={matchedItem?.lineNumber}
                          className={`group relative scroll-mt-4 ${className || ''}`}
                          {...props}
                        >
                          <span>{children}</span>
                          {headingId && (
                            <a
                              href={`#${headingId}`}
                              onClick={(e) => {
                                e.preventDefault();
                                if (matchedItem) handleJumpToHeading(matchedItem);
                              }}
                              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ml-2 text-blue-400 text-xs font-mono select-none inline-block no-underline"
                              title="アンカーリンク"
                            >
                              #
                            </a>
                          )}
                        </Tag>
                      );
                    };
                  };

                  return (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(url) => {
                        if (!url) return '';
                        const trimmed = url.trim();
                        // eslint-disable-next-line no-control-regex
                        const sanitized = trimmed.replace(/[\u0000-\u0020\u007F-\u009F]/g, '');
                        const colonIndex = sanitized.indexOf(':');
                        if (colonIndex !== -1) {
                          const protocol = sanitized.slice(0, colonIndex).toLowerCase();
                          if (protocol === 'javascript' || protocol === 'vbscript') {
                            return '';
                          }
                          if (
                            protocol === 'data' &&
                            !/^data:image\/(png|jpg|jpeg|gif|webp|svg\+xml);/i.test(sanitized)
                          ) {
                            return '';
                          }
                        }
                        return url;
                      }}
                      components={{
                        h1: renderHeading(1, 'h1'),
                        h2: renderHeading(2, 'h2'),
                        h3: renderHeading(3, 'h3'),
                        h4: renderHeading(4, 'h4'),
                        h5: renderHeading(5, 'h5'),
                        h6: renderHeading(6, 'h6'),
                        li({ node, children, className, ...props }) {
                          const lineNum = node?.position?.start?.line;
                          const isTaskItem = className?.includes('task-list-item');

                          if (isTaskItem && lineNum) {
                            return (
                              <li
                                {...props}
                                className={className}
                                onClick={(e) => {
                                  const target = e.target as HTMLElement;
                                  if (
                                    target &&
                                    target.tagName === 'INPUT' &&
                                    (target as HTMLInputElement).type === 'checkbox'
                                  ) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleToggleTaskByLineNumber(lineNum);
                                  }
                                }}
                              >
                                {children}
                              </li>
                            );
                          }

                          return (
                            <li className={className} {...props}>
                              {children}
                            </li>
                          );
                        },
                        input({ node: _node, ...props }) {
                          if (props.type === 'checkbox') {
                            const { disabled, readOnly, checked, ...restProps } = props;
                            void disabled;
                            void readOnly;
                            return (
                              <input
                                {...restProps}
                                checked={!!checked}
                                disabled={false}
                                onChange={() => {}}
                                className="cursor-pointer accent-blue-500 rounded focus:ring-1 focus:ring-blue-500"
                              />
                            );
                          }
                          return <input {...props} />;
                        },
                        a({ node: _node, children, href, ...props }) {
                          const isWebUrl = href && /^https?:\/\//i.test(href);
                          return (
                            <a
                              href={href}
                              {...props}
                              {...(isWebUrl
                                ? { target: '_blank', rel: 'noopener noreferrer' }
                                : {})}
                            >
                              {children}
                            </a>
                          );
                        },
                        pre({ children }) {
                          return <>{children}</>;
                        },
                        code({ node: _node, className, children, ...props }) {
                          const isInline = !className && !String(children).includes('\n');

                          if (isInline) {
                            return (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          }

                          const rawLang = (className || '').replace(/^language-/, '');
                          const [langName, filename] = rawLang.split(':');
                          const lang = langName || 'text';
                          const codeString = String(children).replace(/\n$/, '');
                          const highlightedHtml = highlightCode(codeString, lang);

                          return (
                            <div className="codeblock">
                              {filename && <div className="filename">{filename}</div>}
                              <button
                                type="button"
                                className="clipboard"
                                onClick={() => navigator.clipboard.writeText(codeString)}
                                title="コードをコピー"
                              >
                                <Copy />
                              </button>
                              <pre>
                                <code className={`language-${lang}`}>
                                  <div
                                    className="code-container"
                                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                                  />
                                </code>
                              </pre>
                            </div>
                          );
                        },
                      }}
                    >
                      {value}
                    </ReactMarkdown>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-xs py-8">
                <Eye className="w-6 h-6 mb-2 opacity-40" />
                <p>プレビューする内容がありません</p>
              </div>
            )}
          </div>
        )}

        {/* TOC Sidebar / Drawer */}
        {isTocOpen && (
          <aside className="w-56 sm:w-64 border-l border-[var(--border-color)] bg-[var(--bg-surface)]/95 backdrop-blur-md flex flex-col shrink-0 h-full overflow-hidden select-none animate-in slide-in-from-right-2 duration-150 z-10">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-card)]/50">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--text-primary)]">
                <ListTree className="w-3.5 h-3.5 text-blue-500" />
                <span>{t('editor.toc')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono font-bold">
                  {headings.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleToc}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30 transition-colors"
                title={t('editor.tocClose')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div ref={tocListRef} className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {headings.length > 0 ? (
                headings.map((item) => {
                  const isActive = activeHeadingId === item.id;
                  const indentClass =
                    item.level === 1
                      ? 'pl-2 font-bold text-[12px]'
                      : item.level === 2
                        ? 'pl-4 font-semibold text-[12px]'
                        : item.level === 3
                          ? 'pl-6 font-medium text-[11px]'
                          : item.level === 4
                            ? 'pl-8 text-[11px]'
                            : 'pl-10 text-[10px]';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-toc-id={item.id}
                      onClick={() => handleJumpToHeading(item)}
                      className={`w-full text-left py-1.5 pr-2 rounded-lg transition-all truncate block ${indentClass} ${
                        isActive
                          ? 'bg-blue-600/20 text-blue-400 font-bold border-l-2 border-blue-500 shadow-sm'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
                      }`}
                      title={item.text}
                    >
                      <span className="truncate block">{item.text}</span>
                    </button>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-48 px-3 text-center text-[var(--text-muted)] text-[11px] leading-relaxed">
                  <ListTree className="w-6 h-6 mb-2 opacity-30 text-blue-400" />
                  <p>{t('editor.tocEmpty')}</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
