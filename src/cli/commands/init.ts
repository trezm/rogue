import chalk from 'chalk';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getDb, setRogueHome } from '../../core/db.js';
import { insertProject, getProject } from '../../core/store.js';
import { QARequirement, Project } from '../../core/types.js';

interface InitOptions {
  name?: string;
  mainBranch?: string;
  qa?: string;
  concurrent?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const rogueHome = path.join(cwd, '.rogue');
  setRogueHome(rogueHome);

  const db = getDb();

  // Detect repo path
  let repoPath: string;
  try {
    repoPath = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    console.error(chalk.red('Error: not inside a git repository.'));
    process.exit(1);
  }

  const id = path.basename(repoPath);
  const existing = getProject(db, id);
  if (existing) {
    console.log(chalk.yellow(`Project "${id}" already exists.`));
    return;
  }

  let qaReqs: QARequirement[];
  switch (options.qa) {
    case 'agent': qaReqs = [QARequirement.AGENT_REVIEW]; break;
    case 'human': qaReqs = [QARequirement.HUMAN_REVIEW]; break;
    case 'both': qaReqs = [QARequirement.AGENT_REVIEW, QARequirement.HUMAN_REVIEW]; break;
    case 'none': qaReqs = []; break;
    default: qaReqs = [QARequirement.HUMAN_REVIEW];
  }

  const now = new Date().toISOString();
  const project: Project = {
    id,
    name: options.name || id,
    repoPath,
    mainBranch: options.mainBranch || 'main',
    defaultQARequirements: qaReqs,
    maxConcurrentAgents: options.concurrent ? parseInt(options.concurrent, 10) : 2,
    createdAt: now,
    updatedAt: now,
  };

  insertProject(db, project);
  console.log(chalk.green(`Initialized rogue project "${project.name}" in ${rogueHome}`));
}
