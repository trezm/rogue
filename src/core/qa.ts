import { QARequirement, QAChecklist } from './types.js';

export function createQAChecklist(requirements: QARequirement[]): QAChecklist {
  return {
    requirements,
    agentApproved: false,
    humanApproved: false,
  };
}

export function isQAComplete(qa: QAChecklist): boolean {
  for (const req of qa.requirements) {
    if (req === QARequirement.AGENT_REVIEW && !qa.agentApproved) return false;
    if (req === QARequirement.HUMAN_REVIEW && !qa.humanApproved) return false;
  }
  return true;
}
