export interface OwnerTeamWorkItem {
  signalId: string;
  headline: string;
  severity: string;
  state: string;
  assignedUserId: string | null;
  assignedTo: string | null;
  dueAt: Date | null;
  assetNames: string[];
}

export interface OwnerTeamWorkQueue {
  mine: OwnerTeamWorkItem[];
  unassigned: OwnerTeamWorkItem[];
  delegated: OwnerTeamWorkItem[];
  roleOrExternal: OwnerTeamWorkItem[];
  dueMine: number;
}

function priority(item: OwnerTeamWorkItem, now: Date): number {
  const overdue = item.dueAt && item.dueAt <= now ? 100 : 0;
  const severity = item.severity === "high" ? 30 : item.severity === "medium" ? 20 : 10;
  const due = item.dueAt ? Math.max(0, 15 - Math.floor((item.dueAt.getTime() - now.getTime()) / 86_400_000)) : 0;
  return overdue + severity + due;
}

function ranked(items: OwnerTeamWorkItem[], now: Date): OwnerTeamWorkItem[] {
  return [...items].sort((left, right) => priority(right, now) - priority(left, now) || left.headline.localeCompare(right.headline));
}

export function buildOwnerTeamWorkQueue(input: { items: OwnerTeamWorkItem[]; userId: string; now: Date }): OwnerTeamWorkQueue {
  const active = input.items.filter((item) => item.state !== "resolved");
  const mine = ranked(active.filter((item) => item.assignedUserId === input.userId), input.now);
  const unassigned = ranked(active.filter((item) => !item.assignedUserId && !item.assignedTo), input.now);
  const delegated = ranked(active.filter((item) => item.assignedUserId && item.assignedUserId !== input.userId), input.now);
  const roleOrExternal = ranked(active.filter((item) => !item.assignedUserId && Boolean(item.assignedTo)), input.now);
  return { mine, unassigned, delegated, roleOrExternal, dueMine: mine.filter((item) => Boolean(item.dueAt && item.dueAt <= input.now)).length };
}
