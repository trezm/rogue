import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useWebSocket() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type?.startsWith('ticket:') || data.type?.startsWith('agent:') || data.type?.startsWith('autorun:')) {
          qc.invalidateQueries({ queryKey: ['tickets'] });
          if (data.ticketId) {
            qc.invalidateQueries({ queryKey: ['ticket', data.ticketId] });
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
