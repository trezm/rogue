import React, { useState, useRef, useEffect } from 'react';
import { useQAAction, useAddComment, useResetTicket, useRunAgent } from '../hooks/useTickets';
import { useAgentLog } from '../hooks/useAgentLog';
import type { Ticket } from '../api';

const STATE_COLORS: Record<string, string> = {
  blocked: 'var(--color-state-blocked)',
  ready: 'var(--color-state-ready)',
  in_progress: 'var(--color-state-progress)',
  qa: 'var(--color-state-qa)',
  complete: 'var(--color-state-complete)',
};

type DetailTab = 'activity' | 'agent-log';

interface Props {
  ticket: Ticket;
  activeAgents: Set<string>;
  onClose: () => void;
}

export default function TicketDetail({ ticket, activeAgents, onClose }: Props) {
  const qaAction = useQAAction();
  const addComment = useAddComment();
  const resetTicket = useResetTicket();
  const runAgent = useRunAgent();
  const [comment, setComment] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('activity');
  const logEndRef = useRef<HTMLDivElement>(null);

  const isRunning = activeAgents.has(ticket.id);
  const stateColor = STATE_COLORS[ticket.state] || STATE_COLORS.blocked;
  const { entries: logEntries, liveLines } = useAgentLog(ticket.id, isRunning);

  // Auto-scroll the log when new entries arrive
  useEffect(() => {
    if (activeTab === 'agent-log' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logEntries.length, liveLines.length, activeTab]);

  // Auto-switch to agent log when agent starts running
  useEffect(() => {
    if (isRunning) setActiveTab('agent-log');
  }, [isRunning]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="state-bar mt-1" style={{ background: stateColor, height: '32px' }} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-text-primary leading-snug">{ticket.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-text-muted">{ticket.id}</span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ color: stateColor, background: `color-mix(in oklch, ${stateColor} 15%, transparent)` }}
            >
              {ticket.state.replace('_', ' ')}
            </span>
            {isRunning && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-state-progress agent-running" />
                <span className="text-[10px] font-mono text-state-progress">running</span>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-secondary transition-colors p-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        {ticket.dependencies.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted w-16 pt-0.5 flex-shrink-0">Deps</span>
            <div className="flex flex-wrap gap-1">
              {ticket.dependencies.map(dep => (
                <span key={dep} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary">
                  {dep}
                </span>
              ))}
            </div>
          </div>
        )}
        {ticket.qa.requirements.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted w-16 flex-shrink-0">QA</span>
            <div className="flex gap-2">
              {ticket.qa.requirements.map(req => (
                <span key={req} className="flex items-center gap-1 text-[10px] font-mono text-text-secondary">
                  {req === 'agent_review' ? (
                    <span style={{ color: ticket.qa.agentApproved ? 'var(--color-state-complete)' : 'var(--color-text-muted)' }}>
                      {ticket.qa.agentApproved ? '✓' : '○'} agent
                    </span>
                  ) : (
                    <span style={{ color: ticket.qa.humanApproved ? 'var(--color-state-complete)' : 'var(--color-text-muted)' }}>
                      {ticket.qa.humanApproved ? '✓' : '○'} human
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        {ticket.branchName && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted w-16 flex-shrink-0">Branch</span>
            <span className="text-[10px] font-mono text-accent">{ticket.branchName}</span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="px-4 py-3 border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-2">Description</span>
        <p className="text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-b border-border flex gap-2 flex-wrap items-center">
        {(ticket.state === 'ready' || ticket.state === 'in_progress') && !isRunning && (
          <button
            onClick={() => runAgent.mutate(ticket.id)}
            className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            ▶ Run Agent
          </button>
        )}
        {ticket.state === 'in_progress' && !isRunning && (
          <button
            onClick={() => resetTicket.mutate(ticket.id)}
            className="text-[11px] font-mono px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-hover transition-colors"
          >
            ↺ Reset
          </button>
        )}
        {ticket.state === 'qa' && (
          <>
            <button
              onClick={() => qaAction.mutate({ id: ticket.id, action: { approveHuman: true } })}
              disabled={qaAction.isPending}
              className="flex items-center gap-1 text-[11px] font-mono px-3 py-1.5 rounded border border-state-complete/30 text-state-complete hover:bg-state-complete/10 transition-colors disabled:opacity-50"
            >
              {qaAction.isPending ? '...' : '✓ Approve'}
            </button>
            <button
              onClick={() => qaAction.mutate({ id: ticket.id, action: { reject: true, message: comment || 'Rejected' } })}
              disabled={qaAction.isPending}
              className="flex items-center gap-1 text-[11px] font-mono px-3 py-1.5 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              ✕ Reject
            </button>
          </>
        )}
        {qaAction.isError && (
          <div className="w-full text-[11px] font-mono text-danger mt-1">
            {(qaAction.error as Error).message}
          </div>
        )}
        {runAgent.isError && (
          <div className="w-full text-[11px] font-mono text-danger mt-1">
            {(runAgent.error as Error).message}
          </div>
        )}
      </div>

      {/* Comment input */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && comment.trim()) {
                addComment.mutate({ id: ticket.id, message: comment });
                setComment('');
              }
            }}
            placeholder="Add comment..."
            className="flex-1 text-[12px] font-mono bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary placeholder:text-text-muted focus:border-border-bright focus:outline-none"
          />
          <button
            onClick={() => {
              if (comment.trim()) {
                addComment.mutate({ id: ticket.id, message: comment });
                setComment('');
              }
            }}
            className="text-[11px] font-mono px-3 py-1.5 rounded bg-surface-overlay border border-border text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Send
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {(['activity', 'agent-log'] as DetailTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-text-primary border-b-2 border-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab === 'activity'
              ? `Activity (${ticket.log.length})`
              : `Agent Log${isRunning ? ' ●' : logEntries.length > 0 ? ` (${logEntries.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'activity' ? (
          /* Activity log */
          <div className="space-y-1">
            {[...ticket.log].reverse().map((entry, i) => {
              const authorColor = entry.author === 'agent'
                ? 'var(--color-state-ready)'
                : entry.author === 'human'
                ? 'var(--color-state-complete)'
                : 'var(--color-text-muted)';

              return (
                <div key={i} className="group py-1.5 border-l-2 pl-2.5 border-border hover:border-border-bright transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-medium" style={{ color: authorColor }}>
                      {entry.author}
                    </span>
                    <span className="text-[9px] font-mono text-text-muted">
                      {entry.type !== 'comment' && entry.type !== 'state_change' ? entry.type.replace('_', ' ') : ''}
                    </span>
                    <span className="text-[9px] font-mono text-text-muted ml-auto">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                    {entry.content}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          /* Agent log */
          <div className="space-y-0.5">
            {logEntries.length === 0 && liveLines.length === 0 ? (
              <div className="text-text-muted font-mono text-[11px] py-8 text-center">
                {isRunning ? 'Waiting for agent output...' : 'No agent log available'}
              </div>
            ) : (
              <>
                {logEntries.map((entry, i) => (
                  <AgentLogLine key={`e-${i}`} type={entry.type} text={entry.text} />
                ))}
                {liveLines.map((line, i) => (
                  <AgentLogLine key={`l-${i}`} type="live" text={line} />
                ))}
              </>
            )}
            {isRunning && (
              <div className="flex items-center gap-2 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-state-progress agent-running" />
                <span className="text-[10px] font-mono text-state-progress">Agent is working...</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function AgentLogLine({ type, text }: { type: string; text: string }) {
  const isToolUse = type === 'tool_use';
  const isResult = type === 'result';
  const isLive = type === 'live';

  return (
    <div className={`py-1 font-mono text-[11px] leading-relaxed ${
      isResult ? 'border-t border-border mt-2 pt-2' : ''
    }`}>
      {isToolUse ? (
        <div className="flex items-start gap-1.5">
          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-accent/10 text-accent flex-shrink-0 mt-0.5">
            TOOL
          </span>
          <span className="text-text-secondary break-all">{text}</span>
        </div>
      ) : isResult ? (
        <div className="text-state-complete font-medium">{text}</div>
      ) : isLive ? (
        <div className="text-state-progress whitespace-pre-wrap break-words">{text}</div>
      ) : (
        <div className="text-text-secondary whitespace-pre-wrap break-words">{text}</div>
      )}
    </div>
  );
}
