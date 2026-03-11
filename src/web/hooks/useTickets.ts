import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTickets, fetchTicket, createTicket, runTicketAgent,
  qaAction, addComment, resetTicket, runAll, fetchActiveAgents,
  fetchDagStructure, fetchProjects, fetchCurrentProject,
} from '../api';

export function useTickets() {
  return useQuery({ queryKey: ['tickets'], queryFn: fetchTickets, refetchInterval: 5000 });
}

export function useTicket(id: string) {
  return useQuery({ queryKey: ['ticket', id], queryFn: () => fetchTicket(id), refetchInterval: 3000 });
}

export function useActiveAgents() {
  return useQuery({ queryKey: ['active-agents'], queryFn: fetchActiveAgents, refetchInterval: 3000 });
}

export function useDagStructure() {
  return useQuery({ queryKey: ['dag'], queryFn: fetchDagStructure, refetchInterval: 5000 });
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
}

export function useCurrentProject() {
  return useQuery({ queryKey: ['current-project'], queryFn: fetchCurrentProject });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useRunAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runTicketAgent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useRunAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useQAAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: Parameters<typeof qaAction>[1] }) => qaAction(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) => addComment(id, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useResetTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resetTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}
