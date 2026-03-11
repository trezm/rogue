#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './cli/commands/init.js';
import { addCommand } from './cli/commands/add.js';
import { listCommand } from './cli/commands/list.js';
import { showCommand } from './cli/commands/show.js';
import { planCommand } from './cli/commands/plan.js';
import { runCommand } from './cli/commands/run.js';
import { qaCommand } from './cli/commands/qa.js';
import { commentCommand } from './cli/commands/comment.js';
import { dagCommand } from './cli/commands/dag.js';
import { serveCommand } from './cli/commands/serve.js';

const program = new Command();

program
  .name('rogue')
  .description('Kanban + DAG agent orchestration framework')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a rogue project in the current directory')
  .option('--name <name>', 'Project name')
  .option('--main-branch <branch>', 'Main branch name', 'main')
  .option('--qa <mode>', 'Default QA mode: agent, human, both, none', 'human')
  .option('--concurrent <n>', 'Max concurrent agents', '2')
  .action(initCommand);

program
  .command('add <id>')
  .description('Add a new ticket')
  .requiredOption('-t, --title <title>', 'Ticket title')
  .requiredOption('-d, --description <desc>', 'Ticket description')
  .option('--depends <ids...>', 'Dependency ticket IDs')
  .option('--qa <mode>', 'QA mode: agent, human, both, none')
  .option('-p, --project <id>', 'Project ID')
  .action(addCommand);

program
  .command('list')
  .description('List all tickets')
  .option('-s, --state <state>', 'Filter by state')
  .option('-p, --project <id>', 'Project ID')
  .action(listCommand);

program
  .command('show <id>')
  .description('Show ticket details')
  .action(showCommand);

program
  .command('plan <file>')
  .description('Load tickets from a YAML plan file')
  .option('-p, --project <id>', 'Project ID')
  .action(planCommand);

program
  .command('run [id]')
  .description('Run agent on ticket(s)')
  .option('-a, --all', 'Run all ready tickets')
  .option('--auto', 'Auto-run until blocked on human QA')
  .option('-c, --concurrent <n>', 'Max concurrent agents')
  .option('-p, --project <id>', 'Project ID')
  .action(runCommand);

program
  .command('qa <id>')
  .description('QA actions for a ticket')
  .option('--approve', 'Approve the ticket')
  .option('--reject', 'Reject and send back to in_progress')
  .option('-m, --message <msg>', 'Comment message')
  .option('-p, --project <id>', 'Project ID')
  .action(qaCommand);

program
  .command('comment <id> <message>')
  .description('Add a comment to a ticket')
  .action(commentCommand);

program
  .command('dag')
  .description('Show DAG view of tickets')
  .option('-p, --project <id>', 'Project ID')
  .action(dagCommand);

program
  .command('serve')
  .aliases(['ui'])
  .description('Start the web UI server')
  .option('--port <port>', 'Server port', '4242')
  .option('-p, --project <id>', 'Project ID')
  .action(serveCommand);

program.parse();
