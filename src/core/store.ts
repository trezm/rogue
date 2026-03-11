import Database from 'better-sqlite3';
import { Ticket, TicketState, LogEntry, QAChecklist, QARequirement, Project } from './types.js';
export { getDb, setRogueHome, getRogueHome } from './db.js';

type BroadcastFn = (event: Record<string, any>) => void;
let _broadcast: BroadcastFn | null = null;

export function setBroadcast(fn: BroadcastFn): void {
  _broadcast = fn;
}

function broadcast(event: Record<string, any>): void {
  _broadcast?.(event);
}

// --- Project ---

export function getProject(db: Database.Database, id: string): Project | null {
  const row = db.prepare('SELECT * FROM project WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    mainBranch: row.main_branch,
    defaultQARequirements: JSON.parse(row.default_qa_requirements),
    maxConcurrentAgents: row.max_concurrent_agents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertProject(db: Database.Database, project: Project): void {
  db.prepare(`
    INSERT INTO project (id, name, repo_path, main_branch, default_qa_requirements, max_concurrent_agents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project.id, project.name, project.repoPath, project.mainBranch,
    JSON.stringify(project.defaultQARequirements), project.maxConcurrentAgents,
    project.createdAt, project.updatedAt,
  );
}

export function resolveProject(db: Database.Database, projectId?: string): Project {
  if (projectId) {
    const p = getProject(db, projectId);
    if (!p) throw new Error(`Project "${projectId}" not found`);
    return p;
  }
  const row = db.prepare('SELECT * FROM project ORDER BY created_at DESC LIMIT 1').get() as any;
  if (!row) throw new Error('No project found. Run "rogue init" first.');
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    mainBranch: row.main_branch,
    defaultQARequirements: JSON.parse(row.default_qa_requirements),
    maxConcurrentAgents: row.max_concurrent_agents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Tickets ---

function rowToTicket(db: Database.Database, row: any): Ticket {
  const deps = db.prepare('SELECT depends_on FROM ticket_dependencies WHERE ticket_id = ?')
    .all(row.id)
    .map((d: any) => d.depends_on);

  const logRows = db.prepare('SELECT * FROM log_entries WHERE ticket_id = ? ORDER BY id')
    .all(row.id) as any[];

  const log: LogEntry[] = logRows.map(r => ({
    timestamp: r.timestamp,
    author: r.author,
    type: r.type,
    content: r.content,
  }));

  const qa: QAChecklist = {
    requirements: JSON.parse(row.qa_requirements),
    agentApproved: !!row.qa_agent_approved,
    humanApproved: !!row.qa_human_approved,
  };

  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    state: row.state as TicketState,
    dependencies: deps,
    qa,
    log,
    worktreePath: row.worktree_path || null,
    branchName: row.branch_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTicket(db: Database.Database, id: string): Ticket | null {
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToTicket(db, row);
}

export function getAllTickets(db: Database.Database, projectId: string): Ticket[] {
  const rows = db.prepare('SELECT * FROM tickets WHERE project_id = ? ORDER BY created_at')
    .all(projectId) as any[];
  return rows.map(r => rowToTicket(db, r));
}

export function getTicketsByState(db: Database.Database, state: TicketState, projectId: string): Ticket[] {
  const rows = db.prepare('SELECT * FROM tickets WHERE state = ? AND project_id = ? ORDER BY created_at')
    .all(state, projectId) as any[];
  return rows.map(r => rowToTicket(db, r));
}

export function insertTicket(db: Database.Database, ticket: Ticket): void {
  db.prepare(`
    INSERT INTO tickets (id, project_id, title, description, state, worktree_path, branch_name, qa_requirements, qa_agent_approved, qa_human_approved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.id, ticket.projectId, ticket.title, ticket.description, ticket.state,
    ticket.worktreePath || null, ticket.branchName || null,
    JSON.stringify(ticket.qa.requirements), ticket.qa.agentApproved ? 1 : 0, ticket.qa.humanApproved ? 1 : 0,
    ticket.createdAt, ticket.updatedAt,
  );

  const insertDep = db.prepare('INSERT INTO ticket_dependencies (ticket_id, depends_on) VALUES (?, ?)');
  for (const dep of ticket.dependencies) {
    insertDep.run(ticket.id, dep);
  }

  for (const entry of ticket.log) {
    addLogEntry(db, ticket.id, entry);
  }

  broadcast({ type: 'ticket:created', ticketId: ticket.id });
}

export function updateTicketState(db: Database.Database, id: string, state: TicketState): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE tickets SET state = ?, updated_at = ? WHERE id = ?').run(state, now, id);
  broadcast({ type: 'ticket:updated', ticketId: id, field: 'state', value: state });
}

export function updateTicketFields(
  db: Database.Database,
  id: string,
  fields: {
    worktreePath?: string | null;
    branchName?: string | null;
    qaAgentApproved?: boolean;
    qaHumanApproved?: boolean;
  },
): void {
  const now = new Date().toISOString();
  if (fields.worktreePath !== undefined) {
    db.prepare('UPDATE tickets SET worktree_path = ?, updated_at = ? WHERE id = ?')
      .run(fields.worktreePath, now, id);
  }
  if (fields.branchName !== undefined) {
    db.prepare('UPDATE tickets SET branch_name = ?, updated_at = ? WHERE id = ?')
      .run(fields.branchName, now, id);
  }
  if (fields.qaAgentApproved !== undefined) {
    db.prepare('UPDATE tickets SET qa_agent_approved = ?, updated_at = ? WHERE id = ?')
      .run(fields.qaAgentApproved ? 1 : 0, now, id);
  }
  if (fields.qaHumanApproved !== undefined) {
    db.prepare('UPDATE tickets SET qa_human_approved = ?, updated_at = ? WHERE id = ?')
      .run(fields.qaHumanApproved ? 1 : 0, now, id);
  }
  broadcast({ type: 'ticket:updated', ticketId: id });
}

export function addLogEntry(db: Database.Database, ticketId: string, entry: LogEntry): void {
  db.prepare('INSERT INTO log_entries (ticket_id, timestamp, author, type, content) VALUES (?, ?, ?, ?, ?)')
    .run(ticketId, entry.timestamp, entry.author, entry.type, entry.content);
  broadcast({ type: 'ticket:log', ticketId, entry });
}

export function updateDependencies(db: Database.Database, ticketId: string, dependencies: string[]): void {
  db.prepare('DELETE FROM ticket_dependencies WHERE ticket_id = ?').run(ticketId);
  const insertDep = db.prepare('INSERT INTO ticket_dependencies (ticket_id, depends_on) VALUES (?, ?)');
  for (const dep of dependencies) {
    insertDep.run(ticketId, dep);
  }
  broadcast({ type: 'ticket:updated', ticketId, field: 'dependencies' });
}

export function getAdjacencyMap(db: Database.Database, projectId: string): Record<string, string[]> {
  const tickets = getAllTickets(db, projectId);
  const adj: Record<string, string[]> = {};
  for (const t of tickets) {
    adj[t.id] = t.dependencies;
  }
  return adj;
}

export function cascadeReadyState(db: Database.Database): string[] {
  const promoted: string[] = [];
  // Get all projects
  const projects = db.prepare('SELECT DISTINCT project_id FROM tickets').all() as any[];
  for (const { project_id } of projects) {
    const tickets = getAllTickets(db, project_id);
    for (const ticket of tickets) {
      if (ticket.state !== TicketState.BLOCKED) continue;
      const allDepsComplete = ticket.dependencies.every(depId => {
        const dep = tickets.find(t => t.id === depId);
        return dep && dep.state === TicketState.COMPLETE;
      });
      if (allDepsComplete) {
        updateTicketState(db, ticket.id, TicketState.READY);
        addLogEntry(db, ticket.id, {
          timestamp: new Date().toISOString(),
          author: 'system',
          type: 'state_change',
          content: `${TicketState.BLOCKED} -> ${TicketState.READY} (dependencies complete)`,
        });
        promoted.push(ticket.id);
      }
    }
  }
  return promoted;
}
