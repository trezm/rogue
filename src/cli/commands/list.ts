import chalk from 'chalk';
import { getDb, resolveProject, getAllTickets } from '../../core/store.js';
import { TicketState } from '../../core/types.js';

const STATE_COLORS: Record<string, (s: string) => string> = {
  [TicketState.BLOCKED]: chalk.gray,
  [TicketState.READY]: chalk.blue,
  [TicketState.IN_PROGRESS]: chalk.yellow,
  [TicketState.QA]: chalk.magenta,
  [TicketState.COMPLETE]: chalk.green,
};

interface ListOptions {
  state?: string;
  project?: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);

  let tickets = getAllTickets(db, project.id);
  if (options.state) {
    tickets = tickets.filter(t => t.state === options.state);
  }

  if (tickets.length === 0) {
    console.log(chalk.dim('No tickets found.'));
    return;
  }

  for (const t of tickets) {
    const colorFn = STATE_COLORS[t.state] || chalk.white;
    const deps = t.dependencies.length > 0 ? chalk.dim(` [deps: ${t.dependencies.join(', ')}]`) : '';
    console.log(`  ${colorFn(`[${t.state.padEnd(11)}]`)} ${t.id}: ${t.title}${deps}`);
  }
}
