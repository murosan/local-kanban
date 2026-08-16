import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BoardConfig, Column, CustomFieldDef, Task, ThemeConfig } from './types/task';
import {
  fetchBoardConfig,
  fetchTasks,
  fetchTags,
  createTask,
  updateTask,
  deleteTask,
  saveBoardConfig,
  rebuildCache,
} from './services/api';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskModal } from './components/TaskModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import { ThemeModal } from './components/ThemeModal';
import { ColumnManagerModal } from './components/ColumnManagerModal';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';
import { useI18n } from './i18n/useI18n';

export const App: React.FC = () => {
  const { language, t } = useI18n();
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [initialColumnId, setInitialColumnId] = useState<string>('');

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const applyTheme = useCallback((theme?: ThemeConfig) => {
    const root = document.documentElement;
    if (!theme || theme.name === 'dark') {
      root.removeAttribute('data-theme');
      root.style.removeProperty('--bg-primary');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--accent-color');
      root.style.removeProperty('--text-primary');
    } else if (theme.name === 'custom') {
      root.setAttribute('data-theme', 'custom');
      if (theme.primaryBg) root.style.setProperty('--bg-primary', theme.primaryBg);
      if (theme.cardBg) root.style.setProperty('--bg-card', theme.cardBg);
      if (theme.accentColor) root.style.setProperty('--accent-color', theme.accentColor);
      if (theme.textColor) root.style.setProperty('--text-primary', theme.textColor);
    } else {
      root.setAttribute('data-theme', theme.name);
      root.style.removeProperty('--bg-primary');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--accent-color');
      root.style.removeProperty('--text-primary');
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [cfg, taskList, tagList] = await Promise.all([
        fetchBoardConfig(),
        fetchTasks(debouncedQuery),
        fetchTags(),
      ]);
      setConfig(cfg);
      setTasks(taskList || []);
      setAvailableTags(tagList || []);

      if (cfg.theme && cfg.theme.name) {
        applyTheme(cfg.theme);
        localStorage.setItem('localkanban_theme', JSON.stringify(cfg.theme));
      } else {
        const storedTheme = localStorage.getItem('localkanban_theme');
        if (storedTheme) {
          try {
            const parsedTheme = JSON.parse(storedTheme);
            applyTheme(parsedTheme);
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.error('Error fetching kanban data:', err);
      addToast(t('common.error') || 'Failed to load data from server', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [debouncedQuery, applyTheme, addToast, t]);

  // Debounce searchQuery by 300ms before firing API call
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial load & debounced search query change effect
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Window Focus Sync Mechanism (Spec 4.2)
  useEffect(() => {
    const handleFocus = () => {
      loadData();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadData]);

  const handleRebuildDb = async () => {
    setIsRebuilding(true);
    try {
      const res = await rebuildCache();
      addToast(
        `${t('common.rebuilt') || 'Database rebuilt successfully'} (${res.count} tasks)`,
        'success'
      );
      await loadData();
    } catch (err) {
      console.error('Error rebuilding database:', err);
      addToast('Failed to rebuild database cache', 'error');
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleOpenNewCardModal = (columnId?: string) => {
    const defaultColumnId = columnId || config?.columns[0]?.id || '';
    setInitialColumnId(defaultColumnId);
    setIsCreateModalOpen(true);
  };

  const handleCreateTask = async (data: { title: string; column_id: string }) => {
    try {
      const createdTask = await createTask({
        title: data.title,
        column_id: data.column_id,
      });
      addToast(t('common.created') || 'Task created successfully', 'success');
      await loadData();
      setIsCreateModalOpen(false);
      setSelectedTask(createdTask);
      setIsTaskModalOpen(true);
    } catch (err) {
      console.error('Error creating task:', err);
      addToast('Failed to create task', 'error');
      throw err;
    }
  };

  const handleCardClick = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (taskData: Partial<Task>, options?: { silent?: boolean }) => {
    const defaultColumnId = config?.columns[0]?.id;
    try {
      if (taskData.id) {
        await updateTask(taskData.id, taskData);
        if (!options?.silent) {
          addToast(t('common.saved') || 'Task updated successfully', 'success');
        }
      } else {
        await createTask({
          title: taskData.title || 'Untitled',
          column_id: taskData.column_id || defaultColumnId,
          tags: taskData.tags,
          custom_fields: taskData.custom_fields,
          content: taskData.content,
        });
        if (!options?.silent) {
          addToast(t('common.created') || 'Task created successfully', 'success');
        }
      }
      await loadData();
    } catch (err) {
      console.error('Error saving task:', err);
      if (!options?.silent) {
        addToast('Failed to save task', 'error');
      }
      throw err;
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteTask(id);
      addToast(t('common.deleted') || 'Task deleted', 'info');
      await loadData();
    } catch (err) {
      console.error('Error deleting task:', err);
      addToast('Failed to delete task', 'error');
    }
  };

  const handleSaveConfig = async (newColumns: Column[], newCustomFields?: CustomFieldDef[]) => {
    if (!config || newColumns.length === 0) return;

    try {
      const validColumnIds = new Set(newColumns.map((c) => c.id));
      const fallbackColumn = newColumns[0];

      // Reassign orphan tasks whose column was deleted
      const orphanTasks = tasks.filter((t) => t.column_id && !validColumnIds.has(t.column_id));
      for (const t of orphanTasks) {
        try {
          await updateTask(t.id, {
            column_id: fallbackColumn.id,
          });
        } catch (err) {
          console.error(`Failed to reassign task ${t.id}:`, err);
        }
      }

      const updatedConfig: BoardConfig = {
        ...config,
        columns: newColumns,
        custom_fields: newCustomFields,
        language,
      };
      const saved = await saveBoardConfig(updatedConfig);
      setConfig(saved);
      addToast('Board configuration saved', 'success');
      await loadData();
    } catch (err) {
      console.error('Failed to save board config:', err);
      addToast('Failed to save configuration', 'error');
    }
  };

  const handleSelectTheme = async (theme: ThemeConfig) => {
    applyTheme(theme);
    localStorage.setItem('localkanban_theme', JSON.stringify(theme));
    if (!config) return;
    const updatedConfig: BoardConfig = { ...config, theme, language };
    try {
      const saved = await saveBoardConfig(updatedConfig);
      setConfig(saved);
      addToast('Theme applied', 'success');
    } catch (err) {
      console.error('Failed to save theme to config:', err);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-400">Loading LocalKanban...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col transition-colors duration-300 overflow-hidden">
      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onReload={loadData}
        onRebuildDb={handleRebuildDb}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        onOpenColumnManagerModal={() => setIsColumnModalOpen(true)}
        isSyncing={isSyncing}
        isRebuilding={isRebuilding}
      />

      {/* Main Kanban Board Area */}
      <main className="flex-1 w-full px-3 sm:px-4 pb-3 flex flex-col min-h-0 overflow-hidden">
        <KanbanBoard
          columns={config.columns}
          customFields={config.custom_fields}
          tasks={tasks}
          onTaskUpdated={loadData}
          onTasksChange={setTasks}
          onCardClick={handleCardClick}
          onAddCard={(columnId) => handleOpenNewCardModal(columnId)}
        />
      </main>

      {/* Simple Create Card Modal */}
      {isCreateModalOpen && (
        <CreateTaskModal
          isOpen={isCreateModalOpen}
          columns={config.columns}
          initialColumnId={initialColumnId}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={handleCreateTask}
        />
      )}

      {/* Detail / Edit Modal */}
      {isTaskModalOpen && (
        <TaskModal
          isOpen={isTaskModalOpen}
          task={selectedTask}
          columns={config.columns}
          initialColumnId={initialColumnId}
          customFields={config.custom_fields}
          availableTags={availableTags}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Theme Selection Modal */}
      {isThemeModalOpen && (
        <ThemeModal
          isOpen={isThemeModalOpen}
          onClose={() => setIsThemeModalOpen(false)}
          currentTheme={config.theme}
          onSelectTheme={handleSelectTheme}
        />
      )}

      {/* Board Column Configuration Modal */}
      {isColumnModalOpen && (
        <ColumnManagerModal
          isOpen={isColumnModalOpen}
          onClose={() => setIsColumnModalOpen(false)}
          columns={config.columns}
          customFields={config.custom_fields}
          onSaveConfig={handleSaveConfig}
        />
      )}
    </div>
  );
};

export default App;
