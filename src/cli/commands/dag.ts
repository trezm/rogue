import chalk from 'chalk';
import { getDb, resolveProject, getAllTickets, getAdjacencyMap } from '../../core/store.js';
import { assignLayers } from '../../core/dag.js';
import { TicketState } from '../../core/types.js';

interface DagOptions {
  project?: string;
}

const STATE_ICONS: Record<string, string> = {
  [TicketState.BLOCKED]: '⬜',
  [TicketState.READY]: '🔵',
  [TicketState.IN_PROGRESS]: '🟡',
  [TicketState.QA]: '🟣',
  [TicketState.COMPLETE]: '🟢',
};

export async function dagCommand(options: DagOptions): Promise<void> {
  const db = getDb();
  const project = await resolveProject(db, options.project);
  const tickets = getAllTickets(db, project.id);

  if (tickets.length === 0) {
    console.log(chalk.dim('No tickets found.'));
    return;
  }

  const adjacency = getAdjacencyMap(db, project.id);
  const layers = assignLayers(adjacency);

  // Group tickets by layer
  const layerMap = new Map<number, typeof tickets>();
  for (const t of tickets) {
    const layer = layers[t.id] ?? 0;
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    layerMap.get(layer)!.push(t);
  }

  const sortedLayers = [...layerMap.keys()].sort((a, b) => a - b);

  console.log(chalk.bold('\nDAG View:\n'));
  for (const layer of sortedLayers) {
    const layerTickets = layerMap.get(layer)!;
    console.log(chalk.dim(`Layer ${layer}:`));
    for (const t of layerTickets) {
      const icon = STATE_ICONS[t.state] || '⬜';
      const deps = t.dependencies.length > 0 ? chalk.dim(` <- [${t.dependencies.join(', ')}]`) : '';
      console.log(`  ${icon} ${t.id}: ${t.title}${deps}`);
    }
    console.log();
  }
}
