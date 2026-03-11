import chalk from 'chalk';
import { getDb, resolveProject, getTicket, getAllTickets, insertTicket, getAdjacencyMap } from '../../core/store.js';
import { TicketState, QARequirement, Ticket } from '../../core/types.js';
import { computeInitialState } from '../../core/state-machine.js';
import { detectCycle } from '../../core/dag.js';
import { createQAChecklist } from '../../core/qa.js';

interface AddOptions {
  title: string;
  description: string;
  depends?: string[];
  qa?: string;
  project?: string;
}

export async function addCommand(id: string, options: AddOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);

  if (getTicket(db, id)) {
    console.error(chalk.red(`Ticket "${id}" already exists.`));
    return;
  }

  const dependencies = options.depends || [];
  for (const depId of dependencies) {
    if (!getTicket(db, depId)) {
      console.error(chalk.red(`Dependency "${depId}" not found.`));
      return;
    }
  }

  const adjacency = getAdjacencyMap(db, project.id);
  const cycle = detectCycle(adjacency, id, dependencies);
  if (cycle) {
    console.error(chalk.red(`Cycle detected: ${cycle.join(' -> ')}`));
    return;
  }

  let qaReqs: QARequirement[];
  switch (options.qa) {
    case 'agent': qaReqs = [QARequirement.AGENT_REVIEW]; break;
    case 'human': qaReqs = [QARequirement.HUMAN_REVIEW]; break;
    case 'both': qaReqs = [QARequirement.AGENT_REVIEW, QARequirement.HUMAN_REVIEW]; break;
    case 'none': qaReqs = []; break;
    default: qaReqs = project.defaultQARequirements;
  }

  const allTickets = getAllTickets(db, project.id);
  const stateMap: Record<string, TicketState> = {};
  for (const t of allTickets) stateMap[t.id] = t.state;

  const state = computeInitialState(dependencies, stateMap);
  const now = new Date().toISOString();

  const ticket: Ticket = {
    id,
    projectId: project.id,
    title: options.title,
    description: options.description,
    state,
    dependencies,
    qa: createQAChecklist(qaReqs),
    log: [{ timestamp: now, author: 'human', type: 'state_change', content: `Created in ${state} state` }],
    createdAt: now,
    updatedAt: now,
  };

  insertTicket(db, ticket);
  console.log(chalk.green(`Created ticket "${id}" (${state}): ${options.title}`));
}
