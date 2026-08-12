export const PILOT_INTERVENTION_KINDS = ["call", "email", "meeting", "decision", "note", "follow_up"] as const;
export const PILOT_INTERVENTION_STATUSES = ["open", "scheduled", "completed", "blocked"] as const;

export type PilotInterventionStatus = typeof PILOT_INTERVENTION_STATUSES[number];

export function isPilotInterventionOverdue(input: { status: string; dueAt: Date | null }, now = new Date()): boolean {
  return input.status !== "completed" && Boolean(input.dueAt && input.dueAt.getTime() < now.getTime());
}

export function pilotInterventionAgeDays(createdAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
}

export function pilotInterventionPriority(input: { status: string; dueAt: Date | null; createdAt: Date }, now = new Date()): "overdue" | "blocked" | "aging" | "normal" {
  if (isPilotInterventionOverdue(input, now)) return "overdue";
  if (input.status === "blocked") return "blocked";
  if (input.status !== "completed" && pilotInterventionAgeDays(input.createdAt, now) >= 7) return "aging";
  return "normal";
}
