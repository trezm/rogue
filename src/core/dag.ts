/**
 * Detect cycles in the dependency graph.
 * adjacency: existing adjacency map (ticketId -> dependency ids)
 * newId: the ticket being added/modified
 * newDeps: proposed dependencies for newId
 * Returns the cycle path if found, null otherwise.
 */
export function detectCycle(
  adjacency: Record<string, string[]>,
  newId: string,
  newDeps: string[],
): string[] | null {
  // Build a temporary adjacency map with the proposed change
  const adj = { ...adjacency };
  adj[newId] = newDeps;

  // DFS to detect cycles
  const visited = new Set<string>();
  const stack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(node: string): string[] | null {
    visited.add(node);
    stack.add(node);

    for (const dep of adj[node] || []) {
      if (!visited.has(dep)) {
        parent.set(dep, node);
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (stack.has(dep)) {
        // Found a cycle — reconstruct path
        const path = [dep];
        let current = node;
        while (current !== dep) {
          path.push(current);
          current = parent.get(current) || dep;
        }
        path.push(dep);
        return path.reverse();
      }
    }

    stack.delete(node);
    return null;
  }

  for (const node of Object.keys(adj)) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Topological sort of the DAG.
 * Returns ticket IDs in dependency order (dependencies first).
 */
export function topologicalSort(adjacency: Record<string, string[]>): string[] {
  const inDegree: Record<string, number> = {};
  const nodes = Object.keys(adjacency);
  for (const n of nodes) inDegree[n] = 0;

  for (const node of nodes) {
    for (const dep of adjacency[node]) {
      // dep -> node means dep must come before node
      inDegree[node] = (inDegree[node] || 0) + 1;
    }
  }

  const queue = nodes.filter(n => inDegree[n] === 0);
  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    // Find all nodes that depend on this one
    for (const n of nodes) {
      if (adjacency[n].includes(node)) {
        inDegree[n]--;
        if (inDegree[n] === 0) {
          queue.push(n);
        }
      }
    }
  }

  return result;
}

/**
 * Assign layer numbers for DAG visualization.
 * Layer 0 = no dependencies, layer N = max dependency depth.
 */
export function assignLayers(adjacency: Record<string, string[]>): Record<string, number> {
  const layers: Record<string, number> = {};

  function getLayer(node: string, visited: Set<string>): number {
    if (layers[node] !== undefined) return layers[node];
    if (visited.has(node)) return 0; // cycle guard
    visited.add(node);

    const deps = adjacency[node] || [];
    if (deps.length === 0) {
      layers[node] = 0;
      return 0;
    }

    const maxDep = Math.max(...deps.map(d => getLayer(d, visited)));
    layers[node] = maxDep + 1;
    return layers[node];
  }

  for (const node of Object.keys(adjacency)) {
    getLayer(node, new Set());
  }

  return layers;
}
