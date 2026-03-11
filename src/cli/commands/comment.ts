import chalk from 'chalk';
import { getDb, getTicket, addLogEntry } from '../../core/store.js';

export async function commentCommand(id: string, message: string): Promise<void> {
  const db = getDb();
  const ticket = getTicket(db, id);

  if (!ticket) {
    console.error(chalk.red(`Ticket "${id}" not found.`));
    return;
  }

  addLogEntry(db, id, {
    timestamp: new Date().toISOString(),
    author: 'human',
    type: 'comment',
    content: message,
  });

  console.log(chalk.green(`Comment added to "${id}".`));
}
