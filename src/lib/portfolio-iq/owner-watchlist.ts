export type OwnerWatchObjectType = "property" | "geography" | "operator" | "decision";

export interface OwnerWatchCandidate {
  objectType: OwnerWatchObjectType;
  objectKey: string;
  label: string;
  href: string;
  detail: string;
  signalCount: number;
  priority: number;
  source: "Portfolio IQ" | "Market IQ" | "Operator IQ" | "Decision system";
}

export interface OwnerWatchPin {
  objectType: string;
  objectKey: string;
}

export function ownerWatchIdentity(item: Pick<OwnerWatchCandidate, "objectType" | "objectKey">): string {
  return `${item.objectType}:${item.objectKey}`;
}

export function buildOwnerWatchGroups(input: { candidates: OwnerWatchCandidate[]; pins: OwnerWatchPin[] }) {
  const pinKeys = new Set(input.pins.map((pin) => `${pin.objectType}:${pin.objectKey}`));
  const ranked = [...input.candidates].sort((left, right) =>
    Number(pinKeys.has(ownerWatchIdentity(right))) - Number(pinKeys.has(ownerWatchIdentity(left))) ||
    right.priority - left.priority ||
    right.signalCount - left.signalCount ||
    left.label.localeCompare(right.label)
  );
  const decorate = (candidate: OwnerWatchCandidate) => ({
    ...candidate,
    pinned: pinKeys.has(ownerWatchIdentity(candidate)),
  });
  const items = ranked.map(decorate);
  return {
    pinned: items.filter((item) => item.pinned),
    properties: items.filter((item) => item.objectType === "property"),
    geographies: items.filter((item) => item.objectType === "geography"),
    operators: items.filter((item) => item.objectType === "operator"),
    decisions: items.filter((item) => item.objectType === "decision"),
  };
}
