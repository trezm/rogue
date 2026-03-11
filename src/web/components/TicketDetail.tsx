import React, { useState } from 'react';
import { useQAAction, useAddComment, useResetTicket, useRunAgent } from '../hooks/useTickets';
import type { Ticket } from '../api';

export default function TicketDetail({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const qaAction = useQAAction();
  const addComment = useAddComment();
  const resetTicket = useResetTicket();
  const runAgent = useRunAgent();
  const [comment, setComment] = useState('');

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg">{ticket.title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>

      <div className="text-sm space-y-2 mb-4">
        <p><span className="font-medium">ID:</span> {ticket.id}</p>
        <p><span className="font-medium">State:</span> {ticket.state}</p>
        <p><span className="font-medium">Dependencies:</span> {ticket.dependencies.join(', ') || 'none'}</p>
        <p><span className="font-medium">QA:</span> {ticket.qa.requirements.join(', ') || 'none'}</p>
        {ticket.worktreePath && <p><span className="font-medium">Worktree:</span> {ticket.worktreePath}</p>}
        {ticket.branchName && <p><span className="font-medium">Branch:</span> {ticket.branchName}</p>}
      </div>

      <div className="mb-4">
        <h3 className="font-medium text-sm mb-1">Description</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(ticket.state === 'ready' || ticket.state === 'in_progress') && (
          <button
            onClick={() => runAgent.mutate(ticket.id)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Run Agent
          </button>
        )}
        {ticket.state === 'in_progress' && (
          <button
            onClick={() => resetTicket.mutate(ticket.id)}
            className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Reset to Ready
          </button>
        )}
        {ticket.state === 'qa' && (
          <>
            <button
              onClick={() => qaAction.mutate({ id: ticket.id, action: { approveHuman: true } })}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Approve
            </button>
            <button
              onClick={() => qaAction.mutate({ id: ticket.id, action: { reject: true, message: comment || 'Rejected' } })}
              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Reject
            </button>
          </>
        )}
      </div>

      {/* Comment */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 text-sm border rounded px-2 py-1"
          />
          <button
            onClick={() => { if (comment.trim()) { addComment.mutate({ id: ticket.id, message: comment }); setComment(''); } }}
            className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded hover:bg-gray-900"
          >
            Send
          </button>
        </div>
      </div>

      {/* Log */}
      <div>
        <h3 className="font-medium text-sm mb-2">Activity Log</h3>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {ticket.log.map((entry, i) => (
            <div key={i} className="text-xs border-l-2 pl-2 py-1 border-gray-200">
              <span className={`font-medium ${
                entry.author === 'agent' ? 'text-cyan-600' :
                entry.author === 'human' ? 'text-green-600' : 'text-gray-400'
              }`}>
                {entry.author}
              </span>
              <span className="text-gray-400 ml-1">{new Date(entry.timestamp).toLocaleString()}</span>
              <p className="text-gray-700 mt-0.5 whitespace-pre-wrap">{entry.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
