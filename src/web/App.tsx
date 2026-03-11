import React, { useState } from 'react';
import { useTickets, useRunAgent, useRunAll, useActiveAgents } from './hooks/useTickets';
import { useWebSocket } from './hooks/useWebSocket';
import TicketDetail from './components/TicketDetail';
import type { Ticket } from './api';

const STATE_COLORS: Record<string, string> = {
  blocked: 'bg-gray-200 text-gray-700',
  ready: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  qa: 'bg-purple-100 text-purple-800',
  complete: 'bg-green-100 text-green-800',
};

export default function App() {
  useWebSocket();
  const { data: tickets, isLoading } = useTickets();
  const { data: activeAgentsData } = useActiveAgents();
  const runAgent = useRunAgent();
  const runAllMut = useRunAll();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeAgents = new Set(activeAgentsData?.activeAgents || []);

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>;

  const columns: Record<string, Ticket[]> = {
    blocked: [],
    ready: [],
    in_progress: [],
    qa: [],
    complete: [],
  };

  for (const t of tickets || []) {
    columns[t.state]?.push(t);
  }

  const selectedTicket = selectedId ? tickets?.find(t => t.id === selectedId) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Rogue</h1>
        <button
          onClick={() => runAllMut.mutate()}
          disabled={runAllMut.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {runAllMut.isPending ? 'Starting...' : 'Auto-Run All'}
        </button>
      </header>

      <div className="flex">
        <div className="flex-1 p-6 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {Object.entries(columns).map(([state, stateTickets]) => (
              <div key={state} className="w-72 flex-shrink-0">
                <h2 className="font-semibold text-sm uppercase text-gray-500 mb-3">
                  {state.replace('_', ' ')} ({stateTickets.length})
                </h2>
                <div className="space-y-2">
                  {stateTickets.map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedId(ticket.id)}
                      className={`p-3 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                        selectedId === ticket.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATE_COLORS[ticket.state]}`}>
                          {ticket.state}
                        </span>
                        {activeAgents.has(ticket.id) && (
                          <span className="text-xs text-yellow-600 animate-pulse">running</span>
                        )}
                      </div>
                      <h3 className="font-medium text-sm">{ticket.title}</h3>
                      <p className="text-xs text-gray-500 mt-1 truncate">{ticket.id}</p>
                      {(ticket.state === 'ready' || ticket.state === 'in_progress') && !activeAgents.has(ticket.id) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); runAgent.mutate(ticket.id); }}
                          className="mt-2 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                        >
                          Run Agent
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedTicket && (
          <div className="w-96 border-l bg-white overflow-y-auto max-h-screen">
            <TicketDetail ticket={selectedTicket} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
