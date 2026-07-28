import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

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
    const scrollTop = textarea.scrollTop;
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = `${before}${selectedText}${after}`;

    const newValue = value.substring(0, start) + replacement + value.substring(end);
    const newStart = start + before.length;
    const newEnd = start + before.length + selectedText.length;
    onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
      textarea.scrollTop = scrollTop;
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scrollTop = textarea.scrollTop;
    
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
      /^>\s+/
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

    onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
      textarea.scrollTop = scrollTop;
    }, 0);
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
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const scrollTop = textarea.scrollTop;

      if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineText = value.substring(lineStart, end);
        if (lineText.startsWith('  ')) {
          const newValue = value.substring(0, lineStart) + lineText.substring(2) + value.substring(end);
          const newStart = Math.max(lineStart, start - 2);
          const newEnd = Math.max(lineStart, end - 2);
          onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newStart, newEnd);
            textarea.scrollTop = scrollTop;
          }, 0);
        }
      } else {
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        const newStart = start + 2;
        const newEnd = end + 2;
        onChange(newValue, { immediate: true, selectionStart: newStart, selectionEnd: newEnd });
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newStart, newEnd);
          textarea.scrollTop = scrollTop;
        }, 0);
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
            onChange(newValue, { immediate: true, selectionStart: lineStart, selectionEnd: lineStart });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
          } else {
            const newPrefix = '\n' + prefix.replace(/\[[xX]\]/, '[ ]');
            const newValue = value.substring(0, start) + newPrefix + value.substring(start);
            const nextPos = start + newPrefix.length;
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(nextPos, nextPos);
            }, 0);
          }
          return;
        }

        if (bulletMatch) {
          e.preventDefault();
          const [, prefix, rest] = bulletMatch;
          if (rest.trim() === '') {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            onChange(newValue, { immediate: true, selectionStart: lineStart, selectionEnd: lineStart });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
          } else {
            const newPrefix = '\n' + prefix;
            const newValue = value.substring(0, start) + newPrefix + value.substring(start);
            const nextPos = start + newPrefix.length;
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(nextPos, nextPos);
            }, 0);
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
            onChange(newValue, { immediate: true, selectionStart: lineStart, selectionEnd: lineStart });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
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
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(nextPos, nextPos);
            }, 0);
          }
          return;
        }

        if (quoteMatch) {
          e.preventDefault();
          const [, prefix, rest] = quoteMatch;
          if (rest.trim() === '') {
            const newValue = value.substring(0, lineStart) + value.substring(start);
            onChange(newValue, { immediate: true, selectionStart: lineStart, selectionEnd: lineStart });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(lineStart, lineStart);
            }, 0);
          } else {
            const newPrefix = '\n' + prefix;
            const newValue = value.substring(0, start) + newPrefix + value.substring(start);
            const nextPos = start + newPrefix.length;
            onChange(newValue, { immediate: true, selectionStart: nextPos, selectionEnd: nextPos });
            setTimeout(() => {
              textarea.focus();
              textarea.setSelectionRange(nextPos, nextPos);
            }, 0);
          }
          return;
        }
      }
    }
  };

  const highlightCode = (code: string, language: string) => {
    const normalizedLang = (language || '').toLowerCase();
    const grammar = Prism.languages[normalizedLang] || Prism.languages.javascript || Prism.languages.clike;
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
      let match = lines[targetIdx].match(/^(\s*(?:[-*+]|\d+|\>)*\s*[-*+]?\s*\[)([ xX])(\]\s*.*)$/);

      if (!match) {
        for (const offset of [-1, 1, -2, 2, -3, 3]) {
          const idx = targetIdx + offset;
          if (idx >= 0 && idx < lines.length) {
            const nearMatch = lines[idx].match(/^(\s*(?:[-*+]|\d+|\>)*\s*[-*+]?\s*\[)([ xX])(\]\s*.*)$/);
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
    <div className={`flex flex-col flex-1 border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-input)] transition-all ${
      isFocusMode ? 'fixed inset-2 sm:inset-4 z-50 shadow-2xl bg-[var(--modal-bg)]' : 'min-h-[420px]'
    }`}>
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
                onClick={() => insertFormat('\n| ヘッダー 1 | ヘッダー 2 |\n| --- | --- |\n| セル 1 | セル 2 |\n')}
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
            {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
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
          <div className={`flex-1 flex flex-col h-full ${mode === 'split' ? 'w-1/2 border-r border-[var(--border-color)]' : 'w-full'}`}>
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
              placeholder={placeholder || 'Markdown形式で入力...'}
              className="w-full flex-1 h-full p-4 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-mono text-sm leading-relaxed resize-none overflow-y-auto"
            />
          </div>
        )}

        {/* Rich Preview Area */}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`flex-1 h-full p-5 overflow-y-auto bg-[var(--bg-input)]/40 ${mode === 'split' ? 'w-1/2' : 'w-full'}`}>
            {value.trim() ? (
              <div className="markdown-preview">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
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
                              if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
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
                    input({ node, ...props }) {
                      if (props.type === 'checkbox') {
                        const { disabled, readOnly, checked, ...restProps } = props;
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
                    a({ node, children, ...props }) {
                      return (
                        <a {...props} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      );
                    },
                    pre({ children }) {
                      return <>{children}</>;
                    },
                    code({ node, className, children, ...props }) {
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
                              <div className="code-container" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                            </code>
                          </pre>
                        </div>
                      );
                    },
                  }}
                >
                  {value}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] text-xs py-8">
                <Eye className="w-6 h-6 mb-2 opacity-40" />
                <p>プレビューする内容がありません</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
