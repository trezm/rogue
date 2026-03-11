import { TicketState } from './types.js';

export function computeInitialState(
  dependencies: string[],
  stateMap: Record<string, TicketState>,
): TicketState {
  if (dependencies.length === 0) return TicketState.READY;

  const allComplete = dependencies.every(depId => stateMap[depId] === TicketState.COMPLETE);
  return allComplete ? TicketState.READY : TicketState.BLOCKED;
}
