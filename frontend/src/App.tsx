import React, { useState, useEffect, useCallback } from 'react';
import { BoardConfig, Task, TaskStatus } from './types/task';
import { fetchBoardConfig, fetchTasks, createTask, updateTask, deleteTask } from './services/api';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskModal } from './components/TaskModal';

export const App: React.FC = () => {
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [initialStatus, setInitialStatus] = useState<TaskStatus>('Todo');

  const loadData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [cfg, taskList] = await Promise.all([
        fetchBoardConfig(),
        fetchTasks(searchQuery),
      ]);
      setConfig(cfg);
      setTasks(taskList);
    } catch (err) {
      console.error('Error fetching kanban data:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [searchQuery]);

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

  const handleOpenNewTaskModal = (status: TaskStatus = 'Todo') => {
    setSelectedTask(null);
    setInitialStatus(status);
    setIsModalOpen(true);
  };

  const handleCardClick = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    if (taskData.id) {
      // Update
      await updateTask(taskData.id, taskData);
    } else {
      // Create
      await createTask({
        title: taskData.title || 'Untitled',
        status: taskData.status || 'Todo',
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
    <div className="min-h-screen flex flex-col bg-dark-bg text-slate-100">
      {/* Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onReload={loadData}
        onOpenNewTaskModal={() => handleOpenNewTaskModal('Todo')}
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
        isOpen={isModalOpen}
        task={selectedTask}
        initialStatus={initialStatus}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />
    </div>
  );
};

export default App;
