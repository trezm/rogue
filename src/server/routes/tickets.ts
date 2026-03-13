import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { TicketState, Ticket, QARequirement } from '../../core/types.js';
import {
  getTicket, getAllTickets, getTicketsByState, insertTicket,
  updateTicketState, updateTicketFields, addLogEntry,
  getAdjacencyMap, getProject, cascadeReadyState, updateDependencies,
} from '../../core/store.js';
import { computeInitialState } from '../../core/state-machine.js';
import { detectCycle } from '../../core/dag.js';
import { createQAChecklist, isQAComplete } from '../../core/qa.js';
import { createWorktree, mergeToMain, removeWorktree } from '../../core/worktree.js';
import { runAgent, createLogEntry, AgentResult } from '../../core/agent.js';
import { getAllTrackedAgents, getTrackedAgent, readAgentLog } from '../../core/process-tracker.js';

type Env = { Variables: { db: Database.Database } };

type BroadcastFn = (event: Record<string, any>) => void;

let _autoRunActive = false;

export function ticketRoutes(db: Database.Database, getProjectId: () => string, broadcast?: BroadcastFn): Hono<Env> {
  const app = new Hono<Env>();

  // Inject db into context
  app.use('*', async (c, next) => {
    c.set('db', db);
    await next();
  });

  // List tickets
  app.get('/', (c) => {
    const projectId = getProjectId();
    const state = c.req.query('state') as TicketState | undefined;
    const tickets = state ? getTicketsByState(db, state, projectId) : getAllTickets(db, projectId);
    return c.json(tickets);
  });

  // Check which agents are actively running (via PID files)
  app.get('/active-agents', (c) => {
    const tracked = getAllTrackedAgents();
    const activeAgents = tracked.filter(a => a.alive).map(a => a.ticketId);
    return c.json({ activeAgents });
  });

  // Get agent log for a ticket (parsed stream-json)
  app.get('/:id/agent-log', (c) => {
    const id = c.req.param('id');
    const raw = readAgentLog(id);
    if (!raw) return c.json({ entries: [] });

    const entries: Array<{ type: string; text: string; timestamp?: number }> = [];
    const lines = raw.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              entries.push({ type: 'text', text: block.text });
            } else if (block.type === 'tool_use') {
              const name = block.name || 'tool';
              const input = block.input ? JSON.stringify(block.input).substring(0, 500) : '';
              entries.push({ type: 'tool_use', text: `${name}: ${input}` });
            }
          }
        } else if (event.type === 'result') {
          entries.push({
            type: 'result',
            text: `Completed. Cost: $${(event.cost_usd ?? event.costUsd)?.toFixed(4) ?? 'unknown'}`,
          });
        }
      } catch {
        // not valid JSON
      }
    }

    return c.json({ entries });
  });

  // Get single ticket
  app.get('/:id', (c) => {
    const ticket = getTicket(db, c.req.param('id'));
    if (!ticket) return c.json({ error: 'Not found' }, 404);
    return c.json(ticket);
  });

  // Create ticket
  app.post('/', async (c) => {
    const projectId = getProjectId();
    const project = getProject(db, projectId);
    if (!project) return c.json({ error: 'Project not found' }, 500);

    const body = await c.req.json<{
      id: string;
      title: string;
      description: string;
      dependencies?: string[];
      qa?: 'agent' | 'human' | 'both' | 'none';
    }>();

    if (!body.id || !body.title || !body.description) {
      return c.json({ error: 'id, title, and description are required' }, 400);
    }

    if (getTicket(db, body.id)) {
      return c.json({ error: `Ticket "${body.id}" already exists` }, 409);
    }

    const dependencies = body.dependencies || [];
    for (const depId of dependencies) {
      if (!getTicket(db, depId)) {
        return c.json({ error: `Dependency "${depId}" not found` }, 400);
      }
    }

    const adjacency = getAdjacencyMap(db, projectId);
    const cycle = detectCycle(adjacency, body.id, dependencies);
    if (cycle) {
      return c.json({ error: `Cycle detected: ${cycle.join(' -> ')}` }, 400);
    }

    let qaReqs: QARequirement[];
    switch (body.qa) {
      case 'agent': qaReqs = [QARequirement.AGENT_REVIEW]; break;
      case 'human': qaReqs = [QARequirement.HUMAN_REVIEW]; break;
      case 'both': qaReqs = [QARequirement.AGENT_REVIEW, QARequirement.HUMAN_REVIEW]; break;
      case 'none': qaReqs = []; break;
      default: qaReqs = project.defaultQARequirements;
    }

    const allTickets = getAllTickets(db, projectId);
    const stateMap: Record<string, TicketState> = {};
    for (const t of allTickets) stateMap[t.id] = t.state;

    const state = computeInitialState(dependencies, stateMap);
    const now = new Date().toISOString();

    const ticket: Ticket = {
      id: body.id,
      projectId,
      title: body.title,
      description: body.description,
      state,
      dependencies,
      qa: createQAChecklist(qaReqs),
      log: [{ timestamp: now, author: 'human', type: 'state_change', content: `Created in ${state} state` }],
      createdAt: now,
      updatedAt: now,
    };

    insertTicket(db, ticket);
    return c.json(ticket, 201);
  });

  // Transition state
  app.post('/:id/transition', async (c) => {
    const id = c.req.param('id');
    const { state } = await c.req.json<{ state: TicketState }>();

    const ticket = getTicket(db, id);
    if (!ticket) return c.json({ error: 'Not found' }, 404);

    updateTicketState(db, id, state);
    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: 'system',
      type: 'state_change',
      content: `${ticket.state} -> ${state}`,
    });

    const promoted = cascadeReadyState(db);

    return c.json({ ticket: getTicket(db, id), promoted });
  });

  // Update dependencies
  app.put('/:id/dependencies', async (c) => {
    const projectId = getProjectId();
    const id = c.req.param('id');
    const { dependencies } = await c.req.json<{ dependencies: string[] }>();

    const ticket = getTicket(db, id);
    if (!ticket) return c.json({ error: 'Not found' }, 404);

    // Only allow editing deps on blocked/ready tickets
    if (ticket.state !== TicketState.BLOCKED && ticket.state !== TicketState.READY) {
      return c.json({ error: `Cannot edit dependencies while ticket is ${ticket.state}` }, 400);
    }

    // Validate all dependency IDs exist
    for (const depId of dependencies) {
      if (!getTicket(db, depId)) {
        return c.json({ error: `Dependency "${depId}" not found` }, 400);
      }
    }

    // Check for cycles
    const adjacency = getAdjacencyMap(db, projectId);
    const cycle = detectCycle(adjacency, id, dependencies);
    if (cycle) {
      return c.json({ error: `Cycle detected: ${cycle.join(' -> ')}` }, 400);
    }

    const oldDeps = ticket.dependencies;
    updateDependencies(db, id, dependencies);

    // Recompute state: if all deps complete -> ready, otherwise blocked
    const allTickets = getAllTickets(db, projectId);
    const stateMap: Record<string, TicketState> = {};
    for (const t of allTickets) stateMap[t.id] = t.state;

    const newState = computeInitialState(dependencies, stateMap);
    if (newState !== ticket.state) {
      updateTicketState(db, id, newState);
      addLogEntry(db, id, {
        timestamp: new Date().toISOString(),
        author: 'system',
        type: 'state_change',
        content: `${ticket.state} -> ${newState} (dependencies changed)`,
      });
    }

    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: 'human',
      type: 'comment',
      content: `Dependencies updated: [${oldDeps.join(', ')}] -> [${dependencies.join(', ')}]`,
    });

    const promoted = cascadeReadyState(db);
    return c.json({ ticket: getTicket(db, id), promoted });
  });

  // Reset a stale in_progress ticket back to ready
  app.post('/:id/reset', async (c) => {
    const id = c.req.param('id');
    const ticket = getTicket(db, id);
    if (!ticket) return c.json({ error: 'Not found' }, 404);
    if (ticket.state !== TicketState.IN_PROGRESS) {
      return c.json({ error: `Ticket is not in_progress (current: ${ticket.state})` }, 400);
    }
    const tracked = getTrackedAgent(id);
    if (tracked?.alive) {
      return c.json({ error: 'Agent is still running for this ticket' }, 409);
    }

    updateTicketState(db, id, TicketState.READY);
    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: 'system',
      type: 'state_change',
      content: `in_progress -> ready (reset: agent not running)`,
    });
    return c.json({ ticket: getTicket(db, id), action: 'reset' });
  });

  // QA actions
  app.post('/:id/qa', async (c) => {
    const projectId = getProjectId();
    const id = c.req.param('id');
    const body = await c.req.json<{
      approveAgent?: boolean;
      approveHuman?: boolean;
      reject?: boolean;
      message?: string;
    }>();

    let ticket = getTicket(db, id);
    if (!ticket) return c.json({ error: 'Not found' }, 404);
    if (ticket.state !== TicketState.QA) {
      return c.json({ error: `Ticket is not in QA state (current: ${ticket.state})` }, 400);
    }

    if (body.reject) {
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
        content: body.message || 'QA rejected',
      });
      return c.json({ ticket: getTicket(db, id), action: 'rejected' });
    }

    if (body.approveAgent) {
      updateTicketFields(db, id, { qaAgentApproved: true });
      addLogEntry(db, id, { timestamp: new Date().toISOString(), author: 'agent', type: 'comment', content: 'Agent review: approved' });
    }
    if (body.approveHuman) {
      updateTicketFields(db, id, { qaHumanApproved: true });
      addLogEntry(db, id, { timestamp: new Date().toISOString(), author: 'human', type: 'comment', content: 'Human review: approved' });
    }

    ticket = getTicket(db, id)!;

    if (isQAComplete(ticket.qa)) {
      const project = getProject(db, projectId);
      if (!project) return c.json({ error: 'Project not found' }, 500);

      try {
        await mergeToMain(ticket, project);
        await removeWorktree(ticket, project);
        updateTicketFields(db, id, { worktreePath: null, branchName: null });
        updateTicketState(db, id, TicketState.COMPLETE);
        addLogEntry(db, id, {
          timestamp: new Date().toISOString(),
          author: 'system',
          type: 'state_change',
          content: `${TicketState.QA} -> ${TicketState.COMPLETE}`,
        });
        const promoted = cascadeReadyState(db);
        return c.json({ ticket: getTicket(db, id), action: 'completed', promoted });
      } catch (err: any) {
        return c.json({ error: `Merge failed: ${err.message}` }, 500);
      }
    }

    return c.json({ ticket: getTicket(db, id), action: 'updated' });
  });

  // Add comment
  app.post('/:id/comments', async (c) => {
    const id = c.req.param('id');
    const { message, author } = await c.req.json<{ message: string; author?: string }>();

    if (!getTicket(db, id)) return c.json({ error: 'Not found' }, 404);

    addLogEntry(db, id, {
      timestamp: new Date().toISOString(),
      author: (author as 'agent' | 'human' | 'system') || 'human',
      type: 'comment',
      content: message,
    });

    return c.json({ ok: true });
  });

  // Run agent on a ticket
  app.post('/:id/run', async (c) => {
    const projectId = getProjectId();
    const project = getProject(db, projectId);
    if (!project) return c.json({ error: 'Project not found' }, 500);

    const id = c.req.param('id');
    let ticket = getTicket(db, id);
    if (!ticket) return c.json({ error: 'Not found' }, 404);

    if (ticket.state !== 'ready' && ticket.state !== 'in_progress') {
      return c.json({ error: `Ticket must be ready or in_progress (current: ${ticket.state})` }, 400);
    }

    // Create worktree if needed
    if (!ticket.worktreePath) {
      const { worktreePath, branchName } = await createWorktree(ticket, project);
      updateTicketFields(db, id, { worktreePath, branchName });
      ticket.worktreePath = worktreePath;
      ticket.branchName = branchName;
    }

    // Transition to in_progress
    if (ticket.state === 'ready') {
      updateTicketState(db, id, TicketState.IN_PROGRESS);
      addLogEntry(db, id, {
        timestamp: new Date().toISOString(),
        author: 'system',
        type: 'state_change',
        content: `ready -> in_progress`,
      });
    }

    ticket = getTicket(db, id)!;

    // Build ticket map for agent context
    const allTickets = getAllTickets(db, projectId);
    const ticketMap: Record<string, Ticket> = {};
    for (const t of allTickets) ticketMap[t.id] = t;

    // Fire and forget — agent.ts handles PID tracking
    runAgent(ticket, ticketMap, {
      onOutput: (text) => {
        broadcast?.({ type: 'agent:output', ticketId: id, text });
      },
      onComplete: (result: AgentResult) => {
        const logEntry = createLogEntry(result);
        addLogEntry(db, id, logEntry);
        if (result.testInstructions) {
          addLogEntry(db, id, {
            timestamp: new Date().toISOString(),
            author: 'agent',
            type: 'test_instructions',
            content: result.testInstructions,
          });
        }
        updateTicketState(db, id, TicketState.QA);
        addLogEntry(db, id, {
          timestamp: new Date().toISOString(),
          author: 'agent',
          type: 'state_change',
          content: `in_progress -> qa`,
        });

        // Auto-approve agent review if required
        const t = getTicket(db, id);
        if (t && t.qa.requirements.includes(QARequirement.AGENT_REVIEW) && !t.qa.agentApproved) {
          updateTicketFields(db, id, { qaAgentApproved: true });
          addLogEntry(db, id, {
            timestamp: new Date().toISOString(),
            author: 'agent',
            type: 'comment',
            content: 'Agent review: auto-approved',
          });
        }

        cascadeReadyState(db);
      },
      onError: (error: Error) => {
        broadcast?.({ type: 'agent:output', ticketId: id, text: `Error: ${error.message}` });
        addLogEntry(db, id, {
          timestamp: new Date().toISOString(),
          author: 'agent',
          type: 'agent_output',
          content: `Agent error: ${error.message}`,
        });
      },
    });

    return c.json({ ticket: getTicket(db, id), action: 'agent_started' });
  });

  // Auto-run status
  app.get('/run-all/status', (c) => {
    return c.json({ active: _autoRunActive });
  });

  // Auto-run: continuously run all ready tickets until blocked on human QA
  app.post('/run-all', async (c) => {
    if (_autoRunActive) {
      return c.json({ error: 'Auto-run already in progress' }, 409);
    }

    const projectId = getProjectId();
    const proj = getProject(db, projectId);
    if (!proj) return c.json({ error: 'Project not found' }, 500);
    const project = proj;

    const maxConcurrent = project.maxConcurrentAgents;
    const emit = (event: Record<string, any>) => broadcast?.(event);

    function tryAutoComplete(ticketId: string): boolean {
      const t = getTicket(db, ticketId);
      if (!t || t.state !== TicketState.QA) return false;

      const needsHuman = t.qa.requirements.includes(QARequirement.HUMAN_REVIEW);
      if (needsHuman) {
        emit({ type: 'autorun:blocked', ticketId, title: t.title, reason: 'Needs human QA' });
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

      // Complete the ticket (merge + cleanup)
      const ticket = getTicket(db, ticketId)!;
      if (ticket.worktreePath) {
        mergeToMain(ticket, project).then(() => {
          removeWorktree(ticket, project);
          updateTicketFields(db, ticketId, { worktreePath: null, branchName: null });
        }).catch((err) => {
          emit({ type: 'autorun:error', ticketId, message: `Merge error: ${err.message}` });
        });
      }

      updateTicketState(db, ticketId, TicketState.COMPLETE);
      addLogEntry(db, ticketId, {
        timestamp: new Date().toISOString(),
        author: 'system',
        type: 'state_change',
        content: `${TicketState.QA} -> ${TicketState.COMPLETE}`,
      });
      emit({ type: 'autorun:completed', ticketId, title: ticket.title });
      cascadeReadyState(db);
      return true;
    }

    function runOne(ticketId: string): Promise<void> {
      return new Promise(async (resolve) => {
        let ticket = getTicket(db, ticketId);
        if (!ticket || ticket.state !== TicketState.READY) { resolve(); return; }

        emit({ type: 'autorun:agent_start', ticketId, title: ticket.title });

        if (!ticket.worktreePath) {
          try {
            const { worktreePath, branchName } = await createWorktree(ticket, project);
            updateTicketFields(db, ticketId, { worktreePath, branchName });
            ticket.worktreePath = worktreePath;
            ticket.branchName = branchName;
          } catch (err: any) {
            emit({ type: 'autorun:error', ticketId, message: `Worktree error: ${err.message}` });
            resolve();
            return;
          }
        }

        updateTicketState(db, ticketId, TicketState.IN_PROGRESS);
        addLogEntry(db, ticketId, {
          timestamp: new Date().toISOString(),
          author: 'system',
          type: 'state_change',
          content: `ready -> in_progress`,
        });

        ticket = getTicket(db, ticketId)!;
        const allTickets = getAllTickets(db, projectId);
        const ticketMap: Record<string, Ticket> = {};
        for (const t of allTickets) ticketMap[t.id] = t;

        runAgent(ticket, ticketMap, {
          onOutput: (text) => {
            emit({ type: 'autorun:output', ticketId, text });
          },
          onComplete: (result: AgentResult) => {
            const logEntry = createLogEntry(result);
            addLogEntry(db, ticketId, logEntry);
            if (result.testInstructions) {
              addLogEntry(db, ticketId, {
                timestamp: new Date().toISOString(),
                author: 'agent',
                type: 'test_instructions',
                content: result.testInstructions,
              });
            }
            updateTicketState(db, ticketId, TicketState.QA);
            addLogEntry(db, ticketId, {
              timestamp: new Date().toISOString(),
              author: 'agent',
              type: 'state_change',
              content: `in_progress -> qa`,
            });
            emit({
              type: 'autorun:agent_done', ticketId,
              success: result.success,
              durationMs: result.durationMs,
              costUsd: result.costUsd,
            });
            tryAutoComplete(ticketId);
            cascadeReadyState(db);
            resolve();
          },
          onError: (error: Error) => {
            emit({ type: 'autorun:error', ticketId, message: error.message });
            addLogEntry(db, ticketId, {
              timestamp: new Date().toISOString(),
              author: 'agent',
              type: 'agent_output',
              content: `Agent error: ${error.message}`,
            });
            resolve();
          },
        });
      });
    }

    // Pool-based loop: continuously pick up newly-ready tickets as slots open
    async function loop() {
      const running = new Set<string>();
      const started = new Set<string>();

      function getReady(): string[] {
        return getAllTickets(db, projectId)
          .filter(t => t.state === TicketState.READY && !started.has(t.id))
          .map(t => t.id);
      }

      return new Promise<void>((resolveLoop) => {
        function scheduleNext() {
          const ready = getReady();

          while (running.size < maxConcurrent && ready.length > 0) {
            const ticketId = ready.shift()!;
            started.add(ticketId);
            running.add(ticketId);

            emit({ type: 'autorun:round', round: started.size, count: 1, tickets: [ticketId] });

            runOne(ticketId).then(() => {
              running.delete(ticketId);
              // An agent finished — check for newly unblocked tickets
              scheduleNext();
            });
          }

          // If nothing is running and nothing is ready, we're done
          if (running.size === 0) {
            const all = getAllTickets(db, projectId);
            const inQA = all.filter(t => t.state === TicketState.QA);
            const complete = all.filter(t => t.state === TicketState.COMPLETE);
            const blocked = all.filter(t => t.state === TicketState.BLOCKED);

            emit({
              type: 'autorun:done',
              summary: {
                complete: complete.length,
                qa: inQA.length,
                blocked: blocked.length,
                total: all.length,
              },
              waitingOnHuman: inQA.map(t => ({ id: t.id, title: t.title })),
            });
            _autoRunActive = false;
            resolveLoop();
          }
        }

        scheduleNext();
      });
    }

    _autoRunActive = true;
    const ready = getAllTickets(db, projectId).filter(t => t.state === TicketState.READY);
    emit({ type: 'autorun:started', readyCount: ready.length });

    // Fire and forget
    loop();

    return c.json({ action: 'auto_run_started', readyCount: ready.length });
  });

  // DAG structure
  app.get('/dag/structure', (c) => {
    const projectId = getProjectId();
    const tickets = getAllTickets(db, projectId);
    const nodes = tickets.map(t => ({
      id: t.id,
      title: t.title,
      state: t.state,
      dependencies: t.dependencies,
    }));
    const edges: Array<{ from: string; to: string }> = [];
    for (const t of tickets) {
      for (const dep of t.dependencies) {
        edges.push({ from: dep, to: t.id });
      }
    }
    return c.json({ nodes, edges });
  });

  return app;
}
