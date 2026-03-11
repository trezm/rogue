import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { Ticket, Project } from './types.js';
import { getRogueHome } from './db.js';

export async function createWorktree(
  ticket: Ticket,
  project: Project,
): Promise<{ worktreePath: string; branchName: string }> {
  const worktreesDir = path.join(getRogueHome(), 'worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });

  const worktreePath = path.join(worktreesDir, ticket.id);
  const branchName = `rogue/${ticket.id}`;

  if (fs.existsSync(worktreePath)) {
    return { worktreePath, branchName };
  }

  execSync(
    `git worktree add -b "${branchName}" "${worktreePath}" "${project.mainBranch}"`,
    { cwd: project.repoPath, stdio: 'pipe' },
  );

  return { worktreePath, branchName };
}

export async function mergeToMain(ticket: Ticket, project: Project): Promise<void> {
  if (!ticket.branchName) throw new Error('No branch name for ticket');

  execSync(`git checkout "${project.mainBranch}"`, { cwd: project.repoPath, stdio: 'pipe' });
  execSync(`git merge "${ticket.branchName}" --no-ff -m "Merge ${ticket.id}: ${ticket.title}"`, {
    cwd: project.repoPath,
    stdio: 'pipe',
  });
}

export async function removeWorktree(ticket: Ticket, project: Project): Promise<void> {
  if (!ticket.worktreePath) return;

  try {
    execSync(`git worktree remove "${ticket.worktreePath}" --force`, {
      cwd: project.repoPath,
      stdio: 'pipe',
    });
  } catch {
    // worktree may already be gone
  }

  if (ticket.branchName) {
    try {
      execSync(`git branch -d "${ticket.branchName}"`, { cwd: project.repoPath, stdio: 'pipe' });
    } catch {
      // branch may already be deleted
    }
  }
}
