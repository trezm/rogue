const BASE = '/api';

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  state: string;
  dependencies: string[];
  qa: { requirements: string[]; agentApproved: boolean; humanApproved: boolean };
  log: Array<{ timestamp: string; author: string; type: string; content: string }>;
  worktreePath?: string | null;
  branchName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  mainBranch: string;
  maxConcurrentAgents: number;
  createdAt: string;
}

export interface DagData {
  nodes: Array<{ id: string; title: string; state: string; dependencies: string[] }>;
  edges: Array<{ from: string; to: string }>;
}

export async function fetchTickets(): Promise<Ticket[]> {
  const res = await fetch(`${BASE}/tickets`);
  return res.json();
}

export async function fetchTicket(id: string): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets/${id}`);
  return res.json();
}

export async function createTicket(data: {
  id: string; title: string; description: string;
  dependencies?: string[]; qa?: string;
}): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function runTicketAgent(id: string): Promise<any> {
  const res = await fetch(`${BASE}/tickets/${id}/run`, { method: 'POST' });
  return res.json();
}

export async function runAll(): Promise<any> {
  const res = await fetch(`${BASE}/tickets/run-all`, { method: 'POST' });
  return res.json();
}

export async function qaAction(id: string, action: {
  approveAgent?: boolean; approveHuman?: boolean; reject?: boolean; message?: string;
}): Promise<any> {
  const res = await fetch(`${BASE}/tickets/${id}/qa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  return res.json();
}

export async function addComment(id: string, message: string): Promise<any> {
  const res = await fetch(`${BASE}/tickets/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

export async function resetTicket(id: string): Promise<any> {
  const res = await fetch(`${BASE}/tickets/${id}/reset`, { method: 'POST' });
  return res.json();
}

export async function fetchActiveAgents(): Promise<{ activeAgents: string[] }> {
  const res = await fetch(`${BASE}/tickets/active-agents`);
  return res.json();
}

export async function fetchDagStructure(): Promise<DagData> {
  const res = await fetch(`${BASE}/tickets/dag/structure`);
  return res.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}/projects`);
  return res.json();
}

export async function fetchCurrentProject(): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/project`);
  return res.json();
}
