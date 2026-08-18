export type MarketIqBriefingEmailCandidateStatus =
  | "would_send"
  | "excluded"
  | "no_archive"
  | "already_sent"
  | "in_progress"
  | "retry_requires_click";

export function classifyMarketIqBriefingEmailCandidate(input: {
  organizationExcluded: boolean;
  snapshotId: string | null;
  deliveryStatus: string | null;
}): { status: MarketIqBriefingEmailCandidateStatus; detail: string } {
  if (input.organizationExcluded) {
    return { status: "excluded", detail: "The workspace has disabled digest-style email." };
  }
  if (!input.snapshotId) {
    return { status: "no_archive", detail: "No frozen Market IQ briefing is available." };
  }
  if (input.deliveryStatus === "sent") {
    return { status: "already_sent", detail: "This frozen briefing was already delivered to the user." };
  }
  if (input.deliveryStatus === "sending") {
    return { status: "in_progress", detail: "An explicit user-requested delivery is already in progress." };
  }
  if (input.deliveryStatus === "failed") {
    return { status: "retry_requires_click", detail: "The prior delivery failed. A retry still requires an explicit click." };
  }
  return { status: "would_send", detail: "The user is opted in and has a new frozen briefing." };
}
