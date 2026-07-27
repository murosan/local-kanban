import React from 'react';
import { RefreshCw, Plus, Search, Kanban } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onReload: () => void;
  onOpenNewTaskModal: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onReload,
  onOpenNewTaskModal,
  isSyncing,
}) => {
  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/80 px-6 py-3.5 mb-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 text-white">
            <Kanban className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
              LocalKanban
            </h1>
            <p className="text-xs text-slate-400 font-medium">Phase 1 Prototype</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tasks, tags, body..."
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-900/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/80 transition-all"
            />
          </div>

          {/* Sync Button */}
          <button
            onClick={onReload}
            disabled={isSyncing}
            className="flex items-center space-x-2 px-3.5 py-1.5 text-sm font-medium text-slate-300 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-lg transition-all active:scale-95 disabled:opacity-50"
            title="Reload & Sync Tasks"
          >
            <RefreshCw className={`w-4 h-4 text-slate-300 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          {/* New Task Button */}
          <button
            onClick={onOpenNewTaskModal}
            className="flex items-center space-x-2 px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>

      </div>
    </header>
  );
};
