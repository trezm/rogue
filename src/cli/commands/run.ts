import chalk from 'chalk';
import { TicketState, QARequirement, Project } from '../../core/types.js';
import {
  getDb, resolveProject, getTicket, getAllTickets,
  updateTicketState, updateTicketFields, addLogEntry, cascadeReadyState,
} from '../../core/store.js';
import { createWorktree, mergeToMain, removeWorktree } from '../../core/worktree.js';
import { runAgent, createLogEntry, AgentResult } from '../../core/agent.js';
import Database from 'better-sqlite3';

interface RunOptions {
  all?: boolean;
  auto?: boolean;
  concurrent?: string;
  project?: string;
}

async function runSingleAgent(
  ticketId: string,
  db: Database.Database,
  project: Project,
): Promise<void> {
  let ticket = getTicket(db, ticketId);
  if (!ticket) {
    console.error(`Error: Ticket "${ticketId}" not found.`);
    return;
  }

  if (ticket.state !== TicketState.READY && ticket.state !== TicketState.IN_PROGRESS) {
    console.error(`Error: Ticket "${ticketId}" is in ${ticket.state} state. Must be ready or in_progress.`);
    return;
  }

  // Create worktree if needed
  if (!ticket.worktreePath) {
    console.log(chalk.dim(`  [${ticketId}] Creating worktree...`));
    const { worktreePath, branchName } = await createWorktree(ticket, project);
    updateTicketFields(db, ticketId, { worktreePath, branchName });
    ticket.worktreePath = worktreePath;
    ticket.branchName = branchName;
  }

  // Transition to in_progress
  if (ticket.state === TicketState.READY) {
    updateTicketState(db, ticketId, TicketState.IN_PROGRESS);
    addLogEntry(db, ticketId, {
      timestamp: new Date().toISOString(),
      author: 'system',
      type: 'state_change',
      content: `${TicketState.READY} -> ${TicketState.IN_PROGRESS}`,
    });
  }

  ticket = getTicket(db, ticketId)!;

  // Build ticket map for agent context
  const allTickets = getAllTickets(db, project.id);
  const ticketMap: Record<string, any> = {};
  for (const t of allTickets) ticketMap[t.id] = t;

  console.log(chalk.blue(`▶ [${ticketId}] Running: ${ticket.title}`));

  await new Promise<void>((resolve) => {
    runAgent(ticket, ticketMap, {
      onOutput: (text) => {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            process.stdout.write(chalk.dim(`  [${ticketId}] ${line}\n`));
          }
        }
      },
      onComplete: (result: AgentResult) => {
        const logEntry = createLogEntry(result);
        addLogEntry(db, ticketId, logEntry);

        updateTicketState(db, ticketId, TicketState.QA);
        addLogEntry(db, ticketId, {
          timestamp: new Date().toISOString(),
          author: 'agent',
          type: 'state_change',
          content: `${TicketState.IN_PROGRESS} -> ${TicketState.QA}`,
        });

        const promoted = cascadeReadyState(db);

        if (result.success) {
          console.log(chalk.green(`✓ [${ticketId}] Completed -> QA`));
        } else {
          console.log(chalk.yellow(`⚠ [${ticketId}] Finished with errors -> QA`));
        }

        if (promoted.length > 0) {
          console.log(chalk.green(`  Unblocked: ${promoted.join(', ')}`));
        }

        resolve();
      },
      onError: (error) => {
        console.error(chalk.red(`  [${ticketId}] Error: ${error.message}`));
      },
    });
  });
}

function tryAutoComplete(
  ticketId: string,
  db: Database.Database,
  project: Project,
): boolean {
  const t = getTicket(db, ticketId);
  if (!t || t.state !== TicketState.QA) return false;

  const needsHuman = t.qa.requirements.includes(QARequirement.HUMAN_REVIEW);
  if (needsHuman) {
    console.log(chalk.yellow(`  [${ticketId}] Needs human QA — skipping auto-complete`));
    return false;
  }

  // Auto-approve agent review if required
  if (t.qa.requirements.includes(QARequirement.AGENT_REVIEW) && !t.qa.agentApproved) {
    updateTicketFields(db, ticketId, { qaAgentApproved: true });
    addLogEntry(db, ticketId, {
      timestamp: new Date().toISOString(),
      author: 'agent',
      type: 'comment',
      content: 'Agent review: auto-approved',
    });
  }

  // Merge and complete
  const ticket = getTicket(db, ticketId)!;
  mergeToMain(ticket, project)
    .then(() => removeWorktree(ticket, project))
    .then(() => updateTicketFields(db, ticketId, { worktreePath: null, branchName: null }))
    .catch((err) => console.error(chalk.red(`  [${ticketId}] Merge error: ${err.message}`)));

  updateTicketState(db, ticketId, TicketState.COMPLETE);
  addLogEntry(db, ticketId, {
    timestamp: new Date().toISOString(),
    author: 'system',
    type: 'state_change',
    content: `${TicketState.QA} -> ${TicketState.COMPLETE}`,
  });

  console.log(chalk.green(`✓ [${ticketId}] Auto-completed (no human QA required)`));
  return true;
}

async function runPool(
  ticketIds: string[],
  db: Database.Database,
  project: Project,
  maxConcurrent: number,
  autoComplete: boolean,
): Promise<void> {
  if (ticketIds.length === 1 || maxConcurrent <= 1) {
    for (const tid of ticketIds) {
      await runSingleAgent(tid, db, project);
      if (autoComplete) {
        tryAutoComplete(tid, db, project);
        cascadeReadyState(db);
      }
    }
  } else {
    console.log(chalk.blue(`Running ${ticketIds.length} agents (max ${maxConcurrent} concurrent)`));
    console.log(chalk.dim('─'.repeat(60)));

    const queue = [...ticketIds];
    const running = new Set<Promise<void>>();

    while (queue.length > 0 || running.size > 0) {
      while (queue.length > 0 && running.size < maxConcurrent) {
        const tid = queue.shift()!;
        const promise = runSingleAgent(tid, db, project).then(() => {
          if (autoComplete) {
            tryAutoComplete(tid, db, project);
            cascadeReadyState(db);
          }
          running.delete(promise);
        });
        running.add(promise);
      }

      if (running.size > 0) {
        await Promise.race(running);
      }
    }

    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.green(`All ${ticketIds.length} agents complete.`));
  }
}

export async function runCommand(id: string | undefined, options: RunOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);
  const maxConcurrent = options.concurrent ? parseInt(options.concurrent, 10) : project.maxConcurrentAgents;

  if (options.auto) {
    console.log(chalk.blue('Auto-run: continuously running until blocked on human QA'));
    console.log(chalk.dim('─'.repeat(60)));

    let round = 0;
    while (true) {
      const allTickets = getAllTickets(db, project.id);
      const readyTickets = allTickets.filter(t => t.state === TicketState.READY);

      if (readyTickets.length === 0) {
        const inQA = allTickets.filter(t => t.state === TicketState.QA);
        const inProgress = allTickets.filter(t => t.state === TicketState.IN_PROGRESS);
        console.log(chalk.dim('─'.repeat(60)));
        if (inQA.length > 0) {
          console.log(chalk.yellow(`Stopped: ${inQA.length} ticket(s) awaiting human QA`));
          for (const t of inQA) console.log(chalk.yellow(`  - ${t.id}: ${t.title}`));
        } else if (inProgress.length > 0) {
          console.log(chalk.dim('No ready tickets (some still in progress).'));
        } else {
          console.log(chalk.green('All tickets complete!'));
        }
        break;
      }

      round++;
      console.log(chalk.blue(`\nRound ${round}: ${readyTickets.length} ready ticket(s)`));

      await runPool(readyTickets.map(t => t.id), db, project, maxConcurrent, true);
    }
    return;
  }

  let ticketIds: string[];
  if (id) {
    ticketIds = [id];
  } else {
    const allTickets = getAllTickets(db, project.id);
    const readyTickets = allTickets.filter(t => t.state === TicketState.READY);
    if (readyTickets.length === 0) {
      console.log(chalk.dim('No ready tickets to run.'));
      return;
    }
    ticketIds = options.all ? readyTickets.map(t => t.id) : [readyTickets[0].id];
  }

  await runPool(ticketIds, db, project, maxConcurrent, false);
}
