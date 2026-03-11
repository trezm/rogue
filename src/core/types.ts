export enum TicketState {
  BLOCKED = 'blocked',
  READY = 'ready',
  IN_PROGRESS = 'in_progress',
  QA = 'qa',
  COMPLETE = 'complete',
}

export enum QARequirement {
  AGENT_REVIEW = 'agent_review',
  HUMAN_REVIEW = 'human_review',
}

export interface LogEntry {
  timestamp: string;
  author: 'agent' | 'human' | 'system';
  type: 'agent_output' | 'test_instructions' | 'state_change' | 'comment';
  content: string;
}

export interface QAChecklist {
  requirements: QARequirement[];
  agentApproved: boolean;
  humanApproved: boolean;
}

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  state: TicketState;
  dependencies: string[];
  qa: QAChecklist;
  log: LogEntry[];
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
  defaultQARequirements: QARequirement[];
  maxConcurrentAgents: number;
  createdAt: string;
  updatedAt: string;
}
