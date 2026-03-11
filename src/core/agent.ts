import { spawn, ChildProcess } from 'node:child_process';
import { Ticket, LogEntry } from './types.js';
import { trackAgent, untrackAgent, appendAgentLog } from './process-tracker.js';

export interface AgentResult {
  success: boolean;
  output: string;
  testInstructions?: string;
  costUsd?: number;
  durationMs: number;
}

export interface AgentCallbacks {
  onOutput?: (text: string) => void;
  onComplete?: (result: AgentResult) => void;
  onError?: (error: Error) => void;
}

function buildSystemPrompt(ticket: Ticket, allTickets: Record<string, Ticket>): string {
  const depContext = ticket.dependencies
    .map(depId => {
      const dep = allTickets[depId];
      if (!dep) return '';
      return `- "${dep.title}" (${dep.state}): ${dep.description}`;
    })
    .filter(Boolean)
    .join('\n');

  // Include human comments and QA feedback from the ticket log
  const feedbackEntries = ticket.log.filter(entry =>
    (entry.type === 'comment' && entry.author === 'human') ||
    (entry.type === 'state_change' && entry.content.includes('-> in_progress'))
  );

  let feedbackSection = '';
  if (feedbackEntries.length > 0) {
    const feedbackLines = feedbackEntries
      .map(entry => {
        if (entry.type === 'comment') {
          return `- [${entry.timestamp}] ${entry.author}: ${entry.content}`;
        }
        return `- [${entry.timestamp}] ${entry.content}`;
      })
      .join('\n');
    feedbackSection = `## Previous Feedback
This task was previously attempted and sent back for revisions. Address the following feedback:
${feedbackLines}
`;
  }

  return `You are working on the following task:

## ${ticket.title}

${ticket.description}

${depContext ? `## Completed Dependencies\nThe following tasks have already been completed:\n${depContext}\n` : ''}${feedbackSection}## Instructions
- Work in the current directory (a git worktree)
- Make all necessary code changes to complete the task
- Commit your work when you are done with a descriptive commit message
- Do not push to any remote
- Focus only on this task, do not modify unrelated code
- IMPORTANT: When you are finished, output a section titled "## Test Instructions" with clear step-by-step instructions for a human reviewer to verify your changes work correctly. Include specific commands to run, URLs to visit, or behaviors to check.`;
}

export function runAgent(
  ticket: Ticket,
  allTickets: Record<string, Ticket>,
  callbacks: AgentCallbacks = {}
): ChildProcess {
  if (!ticket.worktreePath) {
    throw new Error(`Ticket "${ticket.id}" has no worktree assigned`);
  }

  const systemPrompt = buildSystemPrompt(ticket, allTickets);

  const args = [
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--system-prompt', systemPrompt,
    '--dangerously-skip-permissions',
    ticket.description,
  ];

  // Strip Claude Code nesting detection env vars
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  // Strip API key so claude uses the logged-in subscription instead
  delete env.ANTHROPIC_API_KEY;
  // Also strip any other vars that might trigger nesting detection
  for (const key of Object.keys(env)) {
    if (key.startsWith('CLAUDE_CODE_') || key.startsWith('CLAUDE_INTERNAL_')) {
      delete env[key];
    }
  }

  console.log(`[agent] spawning claude for "${ticket.id}" in ${ticket.worktreePath}`);

  const proc = spawn('claude', args, {
    cwd: ticket.worktreePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  // Track the process via PID file so it survives server restarts
  if (proc.pid) {
    trackAgent(ticket.id, proc.pid, ticket.worktreePath);
  }

  proc.on('error', (err) => {
    console.error(`[agent] spawn error for "${ticket.id}":`, err.message);
    untrackAgent(ticket.id);
  });

  let fullOutput = '';
  let allTextBlocks: string[] = [];
  const startTime = Date.now();

  let jsonBuffer = '';

  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    fullOutput += text;
    jsonBuffer += text;
    appendAgentLog(ticket.id, text);

    // Parse stream-json lines (each line is a complete JSON object)
    const lines = jsonBuffer.split('\n');
    jsonBuffer = lines.pop() || ''; // keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);

        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              allTextBlocks.push(block.text);
              callbacks.onOutput?.(block.text);
            } else if (block.type === 'tool_use') {
              const name = block.name || 'tool';
              const inputPreview = block.input
                ? JSON.stringify(block.input).substring(0, 200)
                : '';
              callbacks.onOutput?.(`[tool] ${name}: ${inputPreview}`);
            }
          }
        } else if (event.type === 'tool' && event.content) {
          // Tool result — show a brief summary
          for (const block of event.content) {
            if (block.type === 'tool_result' || block.type === 'text') {
              const text = typeof block === 'string' ? block : (block.text || '');
              if (text) {
                const preview = text.length > 300 ? text.substring(0, 300) + '...' : text;
                callbacks.onOutput?.(`[result] ${preview}`);
              }
            }
          }
        } else if (event.type === 'result') {
          const costUsd = event.cost_usd ?? event.costUsd;
          callbacks.onOutput?.(`\n[Agent completed. Cost: $${costUsd?.toFixed(4) ?? 'unknown'}]`);
        }
      } catch {
        // Not valid JSON, output as-is
        if (line.trim()) callbacks.onOutput?.(line);
      }
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    console.error(`[agent:${ticket.id}:stderr] ${text}`);
    callbacks.onOutput?.(`[stderr] ${text}`);
  });

  proc.on('close', (code) => {
    untrackAgent(ticket.id);
    const durationMs = Date.now() - startTime;

    // Try to extract cost from the output
    let costUsd: number | undefined;
    try {
      const lines = fullOutput.split('\n').filter(Boolean);
      for (const line of lines) {
        const event = JSON.parse(line);
        if (event.type === 'result') {
          costUsd = event.cost_usd ?? event.costUsd;
        }
      }
    } catch {
      // ignore parse errors
    }

    // Extract test instructions from agent text output
    const allText = allTextBlocks.join('\n');
    let testInstructions: string | undefined;
    const testMatch = allText.match(/##\s*Test\s+Instructions\s*\n([\s\S]*?)(?=\n##\s|\n\*\*[A-Z]|$)/i);
    if (testMatch) {
      testInstructions = testMatch[1].trim();
    }

    const result: AgentResult = {
      success: code === 0,
      output: fullOutput,
      testInstructions,
      costUsd,
      durationMs,
    };

    if (code === 0) {
      callbacks.onComplete?.(result);
    } else {
      callbacks.onError?.(new Error(`Agent exited with code ${code}`));
      callbacks.onComplete?.(result);
    }
  });

  return proc;
}

export function createLogEntry(result: AgentResult): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    author: 'agent',
    type: 'agent_output',
    content: result.success
      ? `Agent completed successfully in ${(result.durationMs / 1000).toFixed(1)}s${result.costUsd ? ` ($${result.costUsd.toFixed(4)})` : ''}`
      : `Agent failed after ${(result.durationMs / 1000).toFixed(1)}s`,
  };
}
