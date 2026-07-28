import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

type Mode = 'edit' | 'split' | 'preview';

const EDITOR_MODE_KEY = 'localkanban_editor_mode';

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder,
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
    const selectedText = value.substring(start, end) || defaultText;
    const replacement = `${before}${selectedText}${after}`;

    const newValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Find beginning of line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newValue = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
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

  const handleToggleTaskCheckbox = (index: number) => {
    let taskCount = 0;
    const lines = value.split('\n');
    const updatedLines = lines.map((line) => {
      const taskMatch = line.match(/^(\s*[-*+]\s+\[)([ xX])(\].*)$/);
      if (taskMatch) {
        if (taskCount === index) {
          const currentChecked = taskMatch[2] !== ' ';
          const nextMark = currentChecked ? ' ' : 'x';
          taskCount++;
          return `${taskMatch[1]}${nextMark}${taskMatch[3]}`;
        }
        taskCount++;
      }
      return line;
    });
    onChange(updatedLines.join('\n'));
  };

  let previewCheckboxCounter = 0;

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
            <div className="flex items-center space-x-0.5 border-r border-[var(--border-color)] pr-1.5 mr-1">
              <button
                type="button"
                onClick={() => insertLinePrefix('# ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.h1')}
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix('## ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.h2')}
              >
                <Heading2 className="w-4 h-4" />
              </button>
              <button
                type="button"
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
                onClick={() => insertFormat('**', '**', '太字')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.bold')}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormat('*', '*', '斜体')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.italic')}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
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
                onClick={() => insertLinePrefix('- ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.bulletList')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertLinePrefix('1. ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.numberList')}
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                type="button"
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
                onClick={() => insertLinePrefix('> ')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.quote')}
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormat('\n```javascript\n', '\n```\n', '// code here')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.codeBlock')}
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormat('\n| ヘッダー 1 | ヘッダー 2 |\n| --- | --- |\n| セル 1 | セル 2 |\n')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.table')}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormat('[', '](https://example.com)', 'リンクテキスト')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.link')}
              >
                <LinkIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertFormat('\n---\n')}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/40 rounded-lg transition-colors"
                title={t('editor.horizontalRule')}
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
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
              onChange={(e) => onChange(e.target.value)}
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
                    input({ node, ...props }) {
                      if (props.type === 'checkbox') {
                        const currentIndex = previewCheckboxCounter++;
                        return (
                          <input
                            {...props}
                            onChange={() => handleToggleTaskCheckbox(currentIndex)}
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
