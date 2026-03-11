import React, { useMemo } from 'react';
import { useDagStructure } from '../hooks/useTickets';
import type { Ticket } from '../api';

const STATE_COLORS: Record<string, string> = {
  blocked: 'var(--color-state-blocked)',
  ready: 'var(--color-state-ready)',
  in_progress: 'var(--color-state-progress)',
  qa: 'var(--color-state-qa)',
  complete: 'var(--color-state-complete)',
};

const STATE_BG: Record<string, string> = {
  blocked: 'var(--color-state-blocked-bg)',
  ready: 'var(--color-state-ready-bg)',
  in_progress: 'var(--color-state-progress-bg)',
  qa: 'var(--color-state-qa-bg)',
  complete: 'var(--color-state-complete-bg)',
};

interface Props {
  tickets: Ticket[];
  activeAgents: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface LayoutNode {
  id: string;
  title: string;
  state: string;
  layer: number;
  index: number;
  x: number;
  y: number;
  dependencies: string[];
}

export default function DagView({ tickets, activeAgents, selectedId, onSelect }: Props) {
  const { data: dagData } = useDagStructure();

  const layout = useMemo(() => {
    if (!dagData) return { nodes: [] as LayoutNode[], edges: [] as Array<{ from: LayoutNode; to: LayoutNode }> };

    const adj: Record<string, string[]> = {};
    for (const n of dagData.nodes) adj[n.id] = n.dependencies;

    // Assign layers
    const layers: Record<string, number> = {};
    function getLayer(id: string, visited: Set<string>): number {
      if (layers[id] !== undefined) return layers[id];
      if (visited.has(id)) return 0;
      visited.add(id);
      const deps = adj[id] || [];
      if (deps.length === 0) { layers[id] = 0; return 0; }
      const maxDep = Math.max(...deps.map(d => getLayer(d, visited)));
      layers[id] = maxDep + 1;
      return layers[id];
    }
    for (const n of dagData.nodes) getLayer(n.id, new Set());

    // Group by layer
    const layerGroups = new Map<number, typeof dagData.nodes>();
    for (const n of dagData.nodes) {
      const l = layers[n.id] ?? 0;
      if (!layerGroups.has(l)) layerGroups.set(l, []);
      layerGroups.get(l)!.push(n);
    }

    const NODE_W = 220;
    const NODE_H = 70;
    const GAP_X = 80;
    const GAP_Y = 40;
    const PAD = 40;

    const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);
    const layoutNodes: LayoutNode[] = [];
    const nodeMap = new Map<string, LayoutNode>();

    for (const layer of sortedLayers) {
      const group = layerGroups.get(layer)!;
      const totalHeight = group.length * NODE_H + (group.length - 1) * GAP_Y;
      const startY = PAD;

      group.forEach((n, index) => {
        const node: LayoutNode = {
          id: n.id,
          title: n.title,
          state: n.state,
          layer,
          index,
          x: PAD + layer * (NODE_W + GAP_X),
          y: startY + index * (NODE_H + GAP_Y),
          dependencies: n.dependencies,
        };
        layoutNodes.push(node);
        nodeMap.set(n.id, node);
      });
    }

    const edges = dagData.edges
      .map(e => ({ from: nodeMap.get(e.from)!, to: nodeMap.get(e.to)! }))
      .filter(e => e.from && e.to);

    return { nodes: layoutNodes, edges };
  }, [dagData]);

  if (!dagData || layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted font-mono text-sm">No tickets to visualize</div>
      </div>
    );
  }

  const NODE_W = 220;
  const NODE_H = 70;
  const maxX = Math.max(...layout.nodes.map(n => n.x)) + NODE_W + 80;
  const maxY = Math.max(...layout.nodes.map(n => n.y)) + NODE_H + 80;

  return (
    <div className="overflow-auto h-full p-4">
      <svg width={maxX} height={maxY} className="min-w-full">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="var(--color-border-bright)" />
          </marker>
        </defs>

        {/* Edges */}
        {layout.edges.map((e, i) => {
          const fromX = e.from.x + NODE_W;
          const fromY = e.from.y + NODE_H / 2;
          const toX = e.to.x;
          const toY = e.to.y + NODE_H / 2;
          const midX = (fromX + toX) / 2;

          return (
            <path
              key={i}
              d={`M${fromX},${fromY} C${midX},${fromY} ${midX},${toY} ${toX},${toY}`}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
              opacity="0.6"
            />
          );
        })}

        {/* Nodes */}
        {layout.nodes.map(node => {
          const isRunning = activeAgents.has(node.id);
          const isSelected = selectedId === node.id;
          const stateColor = STATE_COLORS[node.state] || STATE_COLORS.blocked;
          const stateBg = STATE_BG[node.state] || STATE_BG.blocked;

          return (
            <g
              key={node.id}
              className="dag-node cursor-pointer"
              onClick={() => onSelect(node.id)}
            >
              {/* Selection glow */}
              {isSelected && (
                <rect
                  x={node.x - 2}
                  y={node.y - 2}
                  width={NODE_W + 4}
                  height={NODE_H + 4}
                  rx="10"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
              )}

              {/* Card background */}
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx="8"
                fill={stateBg}
                stroke={isSelected ? 'var(--color-accent)' : 'var(--color-border)'}
                strokeWidth="1"
              />

              {/* State bar */}
              <rect
                x={node.x + 8}
                y={node.y + 12}
                width="3"
                height={NODE_H - 24}
                rx="1.5"
                fill={stateColor}
                opacity={isSelected ? 1 : 0.6}
              />

              {/* Title */}
              <text
                x={node.x + 20}
                y={node.y + 28}
                fill="var(--color-text-primary)"
                fontSize="12"
                fontFamily="'DM Sans', sans-serif"
                fontWeight="500"
              >
                {node.title.length > 26 ? node.title.slice(0, 24) + '...' : node.title}
              </text>

              {/* ID + state */}
              <text
                x={node.x + 20}
                y={node.y + 46}
                fill="var(--color-text-muted)"
                fontSize="10"
                fontFamily="'JetBrains Mono', monospace"
              >
                {node.id}
              </text>

              <text
                x={node.x + NODE_W - 12}
                y={node.y + 46}
                fill={stateColor}
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
                textAnchor="end"
                fontWeight="500"
              >
                {node.state.replace('_', ' ')}
              </text>

              {/* Running indicator */}
              {isRunning && (
                <circle
                  cx={node.x + NODE_W - 14}
                  cy={node.y + 14}
                  r="4"
                  fill="var(--color-state-progress)"
                  className="agent-running"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
