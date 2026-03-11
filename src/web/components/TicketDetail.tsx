import React, { useState } from 'react';
import { useQAAction, useAddComment, useResetTicket, useRunAgent } from '../hooks/useTickets';
import type { Ticket } from '../api';

const STATE_COLORS: Record<string, string> = {
  blocked: 'var(--color-state-blocked)',
  ready: 'var(--color-state-ready)',
  in_progress: 'var(--color-state-progress)',
  qa: 'var(--color-state-qa)',
  complete: 'var(--color-state-complete)',
};

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

  const isRunning = activeAgents.has(ticket.id);
  const stateColor = STATE_COLORS[ticket.state] || STATE_COLORS.blocked;

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
      <div className="px-4 py-3 border-b border-border flex gap-2 flex-wrap">
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
              className="flex items-center gap-1 text-[11px] font-mono px-3 py-1.5 rounded border border-state-complete/30 text-state-complete hover:bg-state-complete/10 transition-colors"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => qaAction.mutate({ id: ticket.id, action: { reject: true, message: comment || 'Rejected' } })}
              className="flex items-center gap-1 text-[11px] font-mono px-3 py-1.5 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
            >
              ✕ Reject
            </button>
          </>
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

      {/* Activity log */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-3">
          Activity ({ticket.log.length})
        </span>
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
      </div>
    </div>
  );
}
