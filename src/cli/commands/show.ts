import chalk from 'chalk';
import { getDb, getTicket } from '../../core/store.js';

export async function showCommand(id: string): Promise<void> {
  const db = getDb();
  const ticket = getTicket(db, id);

  if (!ticket) {
    console.error(chalk.red(`Ticket "${id}" not found.`));
    return;
  }

  console.log(chalk.bold(`\n${ticket.title}`));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(`ID:           ${ticket.id}`);
  console.log(`State:        ${ticket.state}`);
  console.log(`Dependencies: ${ticket.dependencies.length > 0 ? ticket.dependencies.join(', ') : 'none'}`);
  console.log(`QA:           ${ticket.qa.requirements.join(', ') || 'none'}`);
  if (ticket.worktreePath) console.log(`Worktree:     ${ticket.worktreePath}`);
  if (ticket.branchName) console.log(`Branch:       ${ticket.branchName}`);
  console.log(chalk.dim('─'.repeat(60)));
  console.log(ticket.description);

  if (ticket.log.length > 0) {
    console.log(chalk.dim('\n─── Log ─────────────────────────────────'));
    for (const entry of ticket.log) {
      const prefix = entry.author === 'agent' ? chalk.cyan('agent') :
                     entry.author === 'human' ? chalk.green('human') :
                     chalk.gray('system');
      console.log(`  ${chalk.dim(entry.timestamp)} [${prefix}] ${entry.content}`);
    }
  }
  console.log();
}
