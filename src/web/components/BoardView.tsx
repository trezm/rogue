import React from 'react';
import { useRunAgent } from '../hooks/useTickets';
import type { Ticket } from '../api';

const COLUMNS = [
  { key: 'blocked', label: 'Blocked', color: 'var(--color-state-blocked)', bg: 'var(--color-state-blocked-bg)' },
  { key: 'ready', label: 'Ready', color: 'var(--color-state-ready)', bg: 'var(--color-state-ready-bg)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--color-state-progress)', bg: 'var(--color-state-progress-bg)' },
  { key: 'qa', label: 'QA Review', color: 'var(--color-state-qa)', bg: 'var(--color-state-qa-bg)' },
  { key: 'complete', label: 'Complete', color: 'var(--color-state-complete)', bg: 'var(--color-state-complete-bg)' },
];

interface Props {
  tickets: Ticket[];
  activeAgents: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function BoardView({ tickets, activeAgents, selectedId, onSelect }: Props) {
  const runAgent = useRunAgent();

  const grouped: Record<string, Ticket[]> = { blocked: [], ready: [], in_progress: [], qa: [], complete: [] };
  for (const t of tickets) grouped[t.state]?.push(t);

  return (
    <div className="flex gap-3 p-4 min-w-max h-full">
      {COLUMNS.map(col => (
        <div key={col.key} className="w-[260px] flex-shrink-0 flex flex-col">
          {/* Column header */}
          <div className="flex items-center gap-2 px-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">
              {col.label}
            </span>
            <span className="text-[10px] font-mono text-text-muted ml-auto">
              {grouped[col.key].length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {grouped[col.key].map(ticket => {
              const isRunning = activeAgents.has(ticket.id);
              const isSelected = selectedId === ticket.id;

              return (
                <div
                  key={ticket.id}
                  onClick={() => onSelect(ticket.id)}
                  className={`group rounded-lg border cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'border-accent/50 bg-surface-overlay shadow-lg shadow-accent/5'
                      : 'border-border bg-surface-raised hover:border-border-bright hover:bg-surface-overlay'
                  }`}
                >
                  <div className="flex">
                    {/* State bar */}
                    <div className="state-bar m-2 mr-0" style={{ background: col.color, opacity: isSelected ? 1 : 0.5 }} />

                    <div className="flex-1 p-3 pl-2.5 min-w-0">
                      {/* Title */}
                      <h3 className="text-[13px] font-medium text-text-primary leading-snug mb-1.5 truncate">
                        {ticket.title}
                      </h3>

                      {/* ID + running indicator */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-text-muted truncate">{ticket.id}</span>
                        {isRunning && (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-state-progress agent-running" />
                            <span className="text-[10px] font-mono text-state-progress">running</span>
                          </span>
                        )}
                      </div>

                      {/* Dependencies count */}
                      {ticket.dependencies.length > 0 && (
                        <div className="mt-2 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 10 10" className="text-text-muted">
                            <path d="M2 3H5V7H8" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round"/>
                          </svg>
                          <span className="text-[10px] font-mono text-text-muted">
                            {ticket.dependencies.length} dep{ticket.dependencies.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}

                      {/* Run button */}
                      {(ticket.state === 'ready' || ticket.state === 'in_progress') && !isRunning && (
                        <button
                          onClick={(e) => { e.stopPropagation(); runAgent.mutate(ticket.id); }}
                          className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 hover:border-accent/50 transition-colors"
                        >
                          <span>▶</span> Run Agent
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {grouped[col.key].length === 0 && (
              <div className="flex items-center justify-center py-8 text-text-muted text-[11px] font-mono">
                No tickets
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
