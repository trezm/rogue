import fs from 'node:fs';
import path from 'node:path';
import { getRogueHome } from './db.js';

const AGENTS_DIR = 'agents';

export interface AgentProcessInfo {
  ticketId: string;
  pid: number;
  startedAt: string;
  worktreePath: string;
}

function agentsDir(): string {
  const dir = path.join(getRogueHome(), AGENTS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pidFile(ticketId: string): string {
  return path.join(agentsDir(), `${ticketId}.json`);
}

function logFile(ticketId: string): string {
  return path.join(agentsDir(), `${ticketId}.log`);
}

export function trackAgent(ticketId: string, pid: number, worktreePath: string): void {
  const info: AgentProcessInfo = {
    ticketId,
    pid,
    startedAt: new Date().toISOString(),
    worktreePath,
  };
  fs.writeFileSync(pidFile(ticketId), JSON.stringify(info, null, 2));
}

export function untrackAgent(ticketId: string): void {
  try { fs.unlinkSync(pidFile(ticketId)); } catch {}
  // Keep the log file for history — don't delete it
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getTrackedAgent(ticketId: string): (AgentProcessInfo & { alive: boolean }) | null {
  const file = pidFile(ticketId);
  if (!fs.existsSync(file)) return null;

  try {
    const info: AgentProcessInfo = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { ...info, alive: isProcessAlive(info.pid) };
  } catch {
    return null;
  }
}

export function getAllTrackedAgents(): Array<AgentProcessInfo & { alive: boolean }> {
  const dir = agentsDir();
  const results: Array<AgentProcessInfo & { alive: boolean }> = [];

  let files: string[];
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  } catch {
    return results;
  }

  for (const file of files) {
    try {
      const info: AgentProcessInfo = JSON.parse(
        fs.readFileSync(path.join(dir, file), 'utf-8')
      );
      results.push({ ...info, alive: isProcessAlive(info.pid) });
    } catch {
      // corrupt file, skip
    }
  }

  return results;
}

export function getAgentLogPath(ticketId: string): string {
  return logFile(ticketId);
}

export function appendAgentLog(ticketId: string, text: string): void {
  fs.appendFileSync(logFile(ticketId), text);
}

export function readAgentLog(ticketId: string): string | null {
  const file = logFile(ticketId);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf-8');
}

export function cleanupStaleAgents(): Array<{ ticketId: string; pid: number }> {
  const stale: Array<{ ticketId: string; pid: number }> = [];
  const agents = getAllTrackedAgents();

  for (const agent of agents) {
    if (!agent.alive) {
      stale.push({ ticketId: agent.ticketId, pid: agent.pid });
      untrackAgent(agent.ticketId);
    }
  }

  return stale;
}
