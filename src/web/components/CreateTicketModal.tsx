import React, { useState } from 'react';
import { useCreateTicket, useTickets } from '../hooks/useTickets';

interface Props {
  onClose: () => void;
}

export default function CreateTicketModal({ onClose }: Props) {
  const createTicket = useCreateTicket();
  const { data: tickets } = useTickets();
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [qa, setQa] = useState('default');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !title.trim() || !description.trim()) return;

    createTicket.mutate(
      {
        id: id.trim(),
        title: title.trim(),
        description: description.trim(),
        dependencies: dependencies.length > 0 ? dependencies : undefined,
        qa: qa === 'default' ? undefined : qa,
      },
      { onSuccess: () => onClose() },
    );
  };

  const toggleDep = (depId: string) => {
    setDependencies(prev =>
      prev.includes(depId) ? prev.filter(d => d !== depId) : [...prev, depId],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-surface-raised border border-border rounded-lg shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary font-mono">New Ticket</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* ID */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5">ID</label>
            <input
              type="text"
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="e.g. add-auth-flow"
              className="w-full text-[12px] font-mono bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary placeholder:text-text-muted focus:border-border-bright focus:outline-none"
              autoFocus
            />
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Short summary"
              className="w-full text-[12px] font-mono bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary placeholder:text-text-muted focus:border-border-bright focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detailed description of the task..."
              rows={4}
              className="w-full text-[12px] font-mono bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary placeholder:text-text-muted focus:border-border-bright focus:outline-none resize-none"
            />
          </div>

          {/* Dependencies */}
          {tickets && tickets.length > 0 && (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5">
                Dependencies
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                {tickets.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleDep(t.id)}
                    className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                      dependencies.includes(t.id)
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface text-text-muted hover:text-text-secondary hover:border-border-bright'
                    }`}
                  >
                    {t.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* QA */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1.5">QA Requirements</label>
            <select
              value={qa}
              onChange={e => setQa(e.target.value)}
              className="appearance-none w-full text-[12px] font-mono bg-surface border border-border rounded px-2.5 py-1.5 text-text-secondary cursor-pointer hover:border-border-bright focus:border-accent focus:outline-none"
            >
              <option value="default">Project default</option>
              <option value="human">Human review</option>
              <option value="agent">Agent review</option>
              <option value="both">Both</option>
              <option value="none">None</option>
            </select>
          </div>

          {/* Error */}
          {createTicket.isError && (
            <div className="text-[11px] font-mono text-danger">
              {(createTicket.error as Error).message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-mono px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!id.trim() || !title.trim() || !description.trim() || createTicket.isPending}
              className="text-[11px] font-mono px-4 py-1.5 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {createTicket.isPending ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
