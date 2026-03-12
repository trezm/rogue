import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAgentLog, AgentLogEntry } from '../api';
import { subscribeAgentOutput } from './useWebSocket';

export function useAgentLog(ticketId: string | null, isRunning: boolean) {
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const prevTicketId = useRef<string | null>(null);

  // Reset live lines when ticket changes
  useEffect(() => {
    if (ticketId !== prevTicketId.current) {
      setLiveLines([]);
      prevTicketId.current = ticketId;
    }
  }, [ticketId]);

  // Subscribe to live WebSocket output
  useEffect(() => {
    if (!ticketId) return;
    return subscribeAgentOutput((id, text) => {
      if (id === ticketId) {
        setLiveLines(prev => [...prev, text]);
      }
    });
  }, [ticketId]);

  // Fetch parsed log from REST (historical + current)
  const { data } = useQuery({
    queryKey: ['agent-log', ticketId],
    queryFn: () => fetchAgentLog(ticketId!),
    enabled: !!ticketId,
    refetchInterval: isRunning ? 5000 : false,
  });

  return {
    entries: data?.entries || [],
    liveLines,
  };
}
