import React, { useState } from 'react';
import { useTickets, useRunAll, useActiveAgents, useProjects, useCurrentProject, useSwitchProject } from './hooks/useTickets';
import { useWebSocket } from './hooks/useWebSocket';
import BoardView from './components/BoardView';
import DagView from './components/DagView';
import TicketDetail from './components/TicketDetail';
import type { Ticket } from './api';

type ViewTab = 'board' | 'dag';

export default function App() {
  useWebSocket();
  const { data: tickets, isLoading } = useTickets();
  const { data: activeAgentsData } = useActiveAgents();
  const { data: projects } = useProjects();
  const { data: currentProject } = useCurrentProject();
  const runAllMut = useRunAll();
  const switchProject = useSwitchProject();
  const [activeTab, setActiveTab] = useState<ViewTab>('board');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeAgents = new Set(activeAgentsData?.activeAgents || []);
  const selectedTicket = selectedId ? tickets?.find(t => t.id === selectedId) || null : null;

  const stats = {
    blocked: tickets?.filter(t => t.state === 'blocked').length || 0,
    ready: tickets?.filter(t => t.state === 'ready').length || 0,
    in_progress: tickets?.filter(t => t.state === 'in_progress').length || 0,
    qa: tickets?.filter(t => t.state === 'qa').length || 0,
    complete: tickets?.filter(t => t.state === 'complete').length || 0,
    total: tickets?.length || 0,
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-5 py-3 flex items-center gap-6 bg-surface-raised flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-accent flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4L7 2L12 4L7 6L2 4Z" fill="white" opacity="0.9"/>
              <path d="M2 7L7 9L12 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
              <path d="M2 10L7 12L12 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
            </svg>
          </div>
          <span className="font-mono font-bold text-sm tracking-wide text-text-primary">ROGUE</span>
        </div>

        {/* Project selector */}
        {projects && projects.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Project</span>
            <div className="relative">
              <select
                className="appearance-none bg-surface border border-border rounded px-3 py-1.5 text-xs font-mono text-text-secondary cursor-pointer hover:border-border-bright focus:border-accent focus:outline-none pr-7"
                value={currentProject?.id || ''}
                onChange={(e) => switchProject.mutate(e.target.value)}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        )}

        {/* Tabs */}
        <nav className="flex items-center gap-1 ml-4">
          {(['board', 'dag'] as ViewTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab === 'board' ? '◫ Board' : '◈ DAG'}
            </button>
          ))}
        </nav>

        {/* Stats pills */}
        <div className="flex items-center gap-2 ml-auto">
          {activeAgents.size > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-state-progress-bg border border-state-progress/20">
              <div className="w-1.5 h-1.5 rounded-full bg-state-progress agent-running" />
              <span className="text-[10px] font-mono text-state-progress">{activeAgents.size} running</span>
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-1 rounded bg-surface border border-border text-[10px] font-mono text-text-muted">
            <span>{stats.total} total</span>
            <span className="text-border">|</span>
            <span className="text-state-complete">{stats.complete} done</span>
            <span className="text-border">|</span>
            <span className="text-state-ready">{stats.ready} ready</span>
          </div>

          <button
            onClick={() => runAllMut.mutate()}
            disabled={runAllMut.isPending || stats.ready === 0}
            className="px-3.5 py-1.5 bg-accent text-white text-xs font-mono rounded hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors tracking-wide"
          >
            {runAllMut.isPending ? '⟳ STARTING...' : '▶ AUTO-RUN'}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-text-muted font-mono text-sm">Loading tickets...</div>
            </div>
          ) : activeTab === 'board' ? (
            <BoardView
              tickets={tickets || []}
              activeAgents={activeAgents}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <DagView
              tickets={tickets || []}
              activeAgents={activeAgents}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedTicket && (
          <div className="w-[400px] border-l border-border bg-surface-raised flex-shrink-0 overflow-hidden">
            <TicketDetail
              ticket={selectedTicket}
              activeAgents={activeAgents}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
