import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type AgentOutputListener = (ticketId: string, text: string) => void;
const agentOutputListeners = new Set<AgentOutputListener>();

export function subscribeAgentOutput(listener: AgentOutputListener): () => void {
  agentOutputListeners.add(listener);
  return () => agentOutputListeners.delete(listener);
}

export function useWebSocket() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Forward agent output to subscribers
        if ((data.type === 'agent:output' || data.type === 'autorun:output') && data.ticketId && data.text) {
          for (const listener of agentOutputListeners) {
            listener(data.ticketId, data.text);
          }
        }

        if (data.type?.startsWith('ticket:') || data.type?.startsWith('agent:') || data.type?.startsWith('autorun:')) {
          qc.invalidateQueries({ queryKey: ['tickets'] });
          if (data.ticketId) {
            qc.invalidateQueries({ queryKey: ['ticket', data.ticketId] });
            qc.invalidateQueries({ queryKey: ['agent-log', data.ticketId] });
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      setTimeout(connect, 2000);
    };

    wsRef.current = ws;
  }, [qc]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);
}
