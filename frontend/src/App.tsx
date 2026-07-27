import React, { useState, useEffect, useCallback } from 'react';
import { BoardConfig, Column, StatusItem, Task, TaskStatus, ThemeConfig } from './types/task';
import { fetchBoardConfig, fetchTasks, createTask, updateTask, deleteTask, saveBoardConfig } from './services/api';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskModal } from './components/TaskModal';
import { ThemeModal } from './components/ThemeModal';
import { ColumnManagerModal } from './components/ColumnManagerModal';
import { useI18n } from './i18n/I18nContext';

export const App: React.FC = () => {
  const { language, setLanguage } = useI18n();
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [initialStatus, setInitialStatus] = useState<TaskStatus>('Todo');

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
      const [cfg, taskList] = await Promise.all([
        fetchBoardConfig(),
        fetchTasks(searchQuery),
      ]);
      setConfig(cfg);
      setTasks(taskList);

      if (cfg.language === 'ja' || cfg.language === 'en') {
        setLanguage(cfg.language);
      }

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
    } finally {
      setIsSyncing(false);
    }
  }, [searchQuery, applyTheme, setLanguage]);

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

  const handleOpenNewTaskModal = (status?: TaskStatus) => {
    const defaultStatus = status || (config?.columns[0]?.status ?? 'Todo');
    setSelectedTask(null);
    setInitialStatus(defaultStatus);
    setIsTaskModalOpen(true);
  };

  const handleCardClick = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    const defaultStatus = config?.columns[0]?.status ?? 'Todo';
    if (taskData.id) {
      await updateTask(taskData.id, taskData);
    } else {
      await createTask({
        title: taskData.title || 'Untitled',
        status: taskData.status || defaultStatus,
        tags: taskData.tags,
        assignee: taskData.assignee,
        content: taskData.content,
      });
    }
    await loadData();
  };

  const handleDeleteTask = async (id: string) => {
    await deleteTask(id);
    await loadData();
  };

  const handleSaveConfig = async (newColumns: Column[], newStatuses: StatusItem[]) => {
    if (!config || newColumns.length === 0 || newStatuses.length === 0) return;

    // Check for deleted status items
    const validStatusNames = new Set(newStatuses.map((s) => s.name));
    const fallbackStatus = newStatuses[0].name;

    // Reassign orphan tasks whose status was deleted
    const orphanTasks = tasks.filter((t) => !validStatusNames.has(t.status));
    for (const t of orphanTasks) {
      try {
        await updateTask(t.id, { status: fallbackStatus });
      } catch (err) {
        console.error(`Failed to reassign task ${t.id}:`, err);
      }
    }

    const updatedConfig: BoardConfig = {
      ...config,
      columns: newColumns,
      statuses: newStatuses,
      language,
    };
    const saved = await saveBoardConfig(updatedConfig);
    setConfig(saved);
    await loadData();
  };

  const handleSelectTheme = async (theme: ThemeConfig) => {
    applyTheme(theme);
    localStorage.setItem('localkanban_theme', JSON.stringify(theme));
    if (!config) return;
    const updatedConfig: BoardConfig = { ...config, theme, language };
    try {
      const saved = await saveBoardConfig(updatedConfig);
      setConfig(saved);
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
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onReload={loadData}
        onOpenNewTaskModal={() => handleOpenNewTaskModal()}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        onOpenColumnManagerModal={() => setIsColumnModalOpen(true)}
        isSyncing={isSyncing}
      />

      {/* Main Kanban Board Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6">
        <KanbanBoard
          columns={config.columns}
          tasks={tasks}
          onTaskUpdated={loadData}
          onCardClick={handleCardClick}
        />
      </main>

      {/* Create / Edit Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        task={selectedTask}
        initialStatus={initialStatus}
        statuses={config.statuses}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />

      {/* Theme Selection Modal */}
      <ThemeModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentTheme={config.theme}
        onSelectTheme={handleSelectTheme}
      />

      {/* Board Column Configuration Modal */}
      <ColumnManagerModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        columns={config.columns}
        statuses={config.statuses || []}
        onSaveConfig={handleSaveConfig}
      />
    </div>
  );
};

export default App;
