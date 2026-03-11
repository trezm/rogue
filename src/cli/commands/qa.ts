import chalk from 'chalk';
import { getDb, getTicket, updateTicketState, updateTicketFields, addLogEntry, cascadeReadyState, resolveProject } from '../../core/store.js';
import { TicketState } from '../../core/types.js';
import { isQAComplete } from '../../core/qa.js';
import { mergeToMain, removeWorktree } from '../../core/worktree.js';

interface QAOptions {
  approve?: boolean;
  reject?: boolean;
  message?: string;
  project?: string;
}

export async function qaCommand(id: string, options: QAOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);

  let ticket = getTicket(db, id);
  if (!ticket) {
    console.error(chalk.red(`Ticket "${id}" not found.`));
    return;
  }

  if (ticket.state !== TicketState.QA) {
    console.error(chalk.red(`Ticket "${id}" is not in QA state (current: ${ticket.state}).`));
    return;
  }

  if (options.reject) {
    updateTicketState(db, id, TicketState.IN_PROGRESS);
    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: 'human',
      type: 'state_change',
      content: `${TicketState.QA} -> ${TicketState.IN_PROGRESS}`,
    });
    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: 'human',
      type: 'comment',
      content: options.message || 'QA rejected',
    });
    console.log(chalk.yellow(`Rejected "${id}" — sent back to in_progress.`));
    return;
  }

  if (options.approve) {
    updateTicketFields(db, id, { qaHumanApproved: true });
    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: 'human',
      type: 'comment',
      content: options.message || 'Human review: approved',
    });

    ticket = getTicket(db, id)!;

    if (isQAComplete(ticket.qa)) {
      try {
        await mergeToMain(ticket, project);
        await removeWorktree(ticket, project);
        updateTicketFields(db, id, { worktreePath: null, branchName: null });
      } catch (err: any) {
        console.error(chalk.red(`Merge error: ${err.message}`));
      }

      updateTicketState(db, id, TicketState.COMPLETE);
      addLogEntry(db, id, {
        timestamp: new Date().toISOString(),
        author: 'system',
        type: 'state_change',
        content: `${TicketState.QA} -> ${TicketState.COMPLETE}`,
      });

      const promoted = cascadeReadyState(db);
      console.log(chalk.green(`Approved and completed "${id}".`));
      if (promoted.length > 0) {
        console.log(chalk.green(`  Unblocked: ${promoted.join(', ')}`));
      }
    } else {
      console.log(chalk.blue(`Human approved "${id}" — still waiting on other QA requirements.`));
    }
    return;
  }

  // Show QA status
  console.log(chalk.bold(`\nQA Status: ${ticket.title}`));
  console.log(`  Requirements: ${ticket.qa.requirements.join(', ') || 'none'}`);
  console.log(`  Agent approved: ${ticket.qa.agentApproved}`);
  console.log(`  Human approved: ${ticket.qa.humanApproved}`);
  console.log(`  Complete: ${isQAComplete(ticket.qa)}`);
}
