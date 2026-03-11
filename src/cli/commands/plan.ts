import chalk from 'chalk';
import fs from 'node:fs';
import yaml from 'yaml';
import { getDb, resolveProject, getTicket, insertTicket, getAllTickets, getAdjacencyMap } from '../../core/store.js';
import { TicketState, QARequirement, Ticket } from '../../core/types.js';
import { computeInitialState } from '../../core/state-machine.js';
import { detectCycle } from '../../core/dag.js';
import { createQAChecklist } from '../../core/qa.js';

interface PlanOptions {
  project?: string;
}

interface PlanTicket {
  id: string;
  title: string;
  description: string;
  depends?: string[];
  qa?: 'agent' | 'human' | 'both' | 'none';
}

export async function planCommand(file: string, options: PlanOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);

  if (!fs.existsSync(file)) {
    console.error(chalk.red(`Plan file "${file}" not found.`));
    return;
  }

  const content = fs.readFileSync(file, 'utf-8');
  const plan: { tickets: PlanTicket[] } = yaml.parse(content);

  if (!plan.tickets || !Array.isArray(plan.tickets)) {
    console.error(chalk.red('Plan file must contain a "tickets" array.'));
    return;
  }

  let created = 0;
  for (const pt of plan.tickets) {
    if (getTicket(db, pt.id)) {
      console.log(chalk.yellow(`  Skipping "${pt.id}" — already exists`));
      continue;
    }

    const dependencies = pt.depends || [];
    const adjacency = getAdjacencyMap(db, project.id);
    const cycle = detectCycle(adjacency, pt.id, dependencies);
    if (cycle) {
      console.error(chalk.red(`  Cycle detected for "${pt.id}": ${cycle.join(' -> ')}`));
      continue;
    }

    let qaReqs: QARequirement[];
    switch (pt.qa) {
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
      id: pt.id,
      projectId: project.id,
      title: pt.title,
      description: pt.description,
      state,
      dependencies,
      qa: createQAChecklist(qaReqs),
      log: [{ timestamp: now, author: 'human', type: 'state_change', content: `Created in ${state} state` }],
      createdAt: now,
      updatedAt: now,
    };

    insertTicket(db, ticket);
    console.log(chalk.green(`  Created "${pt.id}" (${state}): ${pt.title}`));
    created++;
  }

  console.log(chalk.blue(`\nPlan loaded: ${created} ticket(s) created.`));
}
