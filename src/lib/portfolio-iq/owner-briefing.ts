import { createHash } from "node:crypto";

export const OWNER_BRIEFING_VERSION = 1 as const;

export interface OwnerBriefingAttentionItem {
  signalId: string;
  severity: string;
  category: string;
  headline: string;
  narrative: string;
  exposedAssets: Array<{ name: string; slug: string; operatorName: string | null }>;
  decisionState: string | null;
  assignedTo: string | null;
  dueAt: string | null;
}

export interface OwnerBriefingSnapshot {
  version: typeof OWNER_BRIEFING_VERSION;
  generatedAt: string;
  portfolio: { id: string; name: string; marketId: string };
  executiveHeadline: string;
  executiveSummary: string;
  attention: OwnerBriefingAttentionItem[];
  decisions: { active: number; assigned: number; due: number; monitoring: number };
  collaboration: { awaitingResponse: number; overdue: number; awaitingOwnerReview: number; acceptedPlans: number };
  financial: { ready: number; incomplete: number; conservative: number; base: number; upside: number };
  outcomes: { ready: number; due: number; waiting: number; reviewed: number };
  sources: Array<{ label: string; status: "current" | "limited"; detail: string }>;
}

export function buildOwnerBriefingSnapshot(input: {
  generatedAt: Date;
  portfolio: { id: string; name: string; marketId: string };
  attention: OwnerBriefingAttentionItem[];
  decisions: OwnerBriefingSnapshot["decisions"];
  collaboration: OwnerBriefingSnapshot["collaboration"];
  financial: OwnerBriefingSnapshot["financial"];
  outcomes: OwnerBriefingSnapshot["outcomes"];
  sources: OwnerBriefingSnapshot["sources"];
}): OwnerBriefingSnapshot {
  const attention = input.attention.slice(0, 5);
  const exposedAssets = new Set(attention.flatMap((item) => item.exposedAssets.map((asset) => asset.slug)));
  const executiveHeadline = attention[0]?.headline ?? "No material portfolio changes require attention";
  const decisionCopy = input.decisions.due
    ? `${input.decisions.due} decision${input.decisions.due === 1 ? " is" : "s are"} due for follow-up.`
    : input.decisions.active
      ? `${input.decisions.active} active decision${input.decisions.active === 1 ? " is" : "s are"} being monitored.`
      : "No owner decision is currently overdue.";
  const collaborationCopy = input.collaboration.awaitingOwnerReview
    ? `${input.collaboration.awaitingOwnerReview} property-manager response${input.collaboration.awaitingOwnerReview === 1 ? " awaits" : "s await"} owner review.`
    : input.collaboration.awaitingResponse
      ? `${input.collaboration.awaitingResponse} property-manager response${input.collaboration.awaitingResponse === 1 ? " is" : "s are"} pending.`
      : "No property-manager response is waiting for review.";
  const executiveSummary = attention.length
    ? `${attention.length} connected finding${attention.length === 1 ? "" : "s"} affect ${exposedAssets.size} portfolio asset${exposedAssets.size === 1 ? "" : "s"}. ${decisionCopy} ${collaborationCopy}`
    : `${decisionCopy} ${collaborationCopy}`;
  return { version: OWNER_BRIEFING_VERSION, generatedAt: input.generatedAt.toISOString(), portfolio: input.portfolio, executiveHeadline, executiveSummary, attention, decisions: input.decisions, collaboration: input.collaboration, financial: input.financial, outcomes: input.outcomes, sources: input.sources };
}

export function ownerBriefingMaterialFingerprint(snapshot: OwnerBriefingSnapshot): string {
  const materialState = {
    version: snapshot.version,
    portfolio: snapshot.portfolio,
    executiveHeadline: snapshot.executiveHeadline,
    executiveSummary: snapshot.executiveSummary,
    attention: snapshot.attention,
    decisions: snapshot.decisions,
    collaboration: snapshot.collaboration,
    financial: snapshot.financial,
    outcomes: snapshot.outcomes,
    sources: snapshot.sources,
  };
  return createHash("sha256").update(JSON.stringify(materialState)).digest("hex");
}

export function ownerBriefingHasMaterialContent(snapshot: OwnerBriefingSnapshot): boolean {
  return snapshot.attention.length > 0
    || snapshot.decisions.due > 0
    || snapshot.collaboration.overdue > 0
    || snapshot.collaboration.awaitingOwnerReview > 0
    || snapshot.outcomes.ready > 0
    || snapshot.outcomes.due > 0;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function money(value: number): string { return `$${Math.round(value).toLocaleString("en-US")}`; }

export function buildOwnerBriefingEmail(input: { snapshot: OwnerBriefingSnapshot; recipientName: string | null; reportUrl: string; preview?: boolean }) {
  const { snapshot } = input;
  const reportOrigin = new URL(input.reportUrl).origin;
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hello,";
  const subject = `${input.preview ? "[preview] " : ""}Dwellsy IQ: ${snapshot.executiveHeadline}`;
  const textItems = snapshot.attention.map((item) => `• ${item.headline}\n  ${item.narrative}\n  Assets: ${item.exposedAssets.map((asset) => asset.name).join(", ") || "Market-level"}${item.decisionState ? `\n  Decision: ${item.decisionState}` : ""}${item.assignedTo ? `\n  Owner: ${item.assignedTo}` : ""}\n  Review: ${reportOrigin}/today/cases/${encodeURIComponent(item.signalId)}`).join("\n\n");
  const text = `${greeting}\n\n${snapshot.executiveSummary}\n\n${textItems || "No material changes this period."}\n\nDecision follow-through\nDue: ${snapshot.decisions.due}\nPM responses awaiting review: ${snapshot.collaboration.awaitingOwnerReview}\nOutcome reviews ready: ${snapshot.outcomes.ready}\n\nOpen the owner briefing: ${input.reportUrl}\n\nDwellsy IQ reports advertised asking-market intelligence. It does not measure occupancy, signed leases, concessions, effective rent, or NOI.`;
  const attentionCards = snapshot.attention.length ? snapshot.attention.map((item) => `<div style="border:1px solid #d7dee8;border-radius:10px;padding:18px;margin:0 0 12px;background:#fff"><div style="color:${item.severity === "high" ? "#a4511b" : "#19758f"};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(item.category)} · ${escapeHtml(item.severity)}</div><h2 style="color:#0c1f44;font-size:18px;line-height:1.35;margin:6px 0 8px">${escapeHtml(item.headline)}</h2><p style="color:#465166;font-size:14px;line-height:1.6;margin:0">${escapeHtml(item.narrative)}</p><p style="color:#687386;font-size:12px;line-height:1.55;margin:12px 0 0;padding-top:10px;border-top:1px solid #e3e8ef"><strong>Exposed assets:</strong> ${escapeHtml(item.exposedAssets.map((asset) => asset.name).join(", ") || "Market-level")}${item.decisionState ? `<br><strong>Decision:</strong> ${escapeHtml(item.decisionState)}` : ""}${item.assignedTo ? `<br><strong>Owner:</strong> ${escapeHtml(item.assignedTo)}` : ""}</p><a href="${escapeHtml(`${reportOrigin}/today/cases/${encodeURIComponent(item.signalId)}`)}" style="display:inline-block;margin-top:12px;color:#19758f;font-size:13px;font-weight:700;text-decoration:none">Open decision case</a></div>`).join("") : `<div style="border:1px solid #bcdce7;border-radius:10px;padding:18px;background:#edf8fb;color:#0c1f44">No material changes this period.</div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#18233a"><div style="max-width:680px;margin:0 auto;padding:28px 18px"><div style="background:#0c1f44;border-radius:12px 12px 0 0;padding:22px 26px;color:#fff"><div style="color:#ffcf25;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Dwellsy IQ Online</div><div style="font-size:25px;font-weight:700;margin-top:5px">Weekly owner briefing</div><div style="font-size:13px;margin-top:5px;color:#d9e3f3">${escapeHtml(snapshot.portfolio.name)}</div></div><div style="background:#fff;border:1px solid #d7dee8;border-top:0;border-radius:0 0 12px 12px;padding:26px"><p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(greeting)}</p><h1 style="color:#0c1f44;font-size:22px;line-height:1.35;margin:0 0 8px">${escapeHtml(snapshot.executiveHeadline)}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 22px">${escapeHtml(snapshot.executiveSummary)}</p>${attentionCards}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0"><div style="background:#f5f7fa;border-radius:8px;padding:12px"><div style="font-size:11px;color:#687386">DECISIONS DUE</div><strong style="font-size:22px;color:#0c1f44">${snapshot.decisions.due}</strong></div><div style="background:#f5f7fa;border-radius:8px;padding:12px"><div style="font-size:11px;color:#687386">PM REVIEWS</div><strong style="font-size:22px;color:#0c1f44">${snapshot.collaboration.awaitingOwnerReview}</strong></div><div style="background:#f5f7fa;border-radius:8px;padding:12px"><div style="font-size:11px;color:#687386">OUTCOMES READY</div><strong style="font-size:22px;color:#0c1f44">${snapshot.outcomes.ready}</strong></div></div>${snapshot.financial.ready ? `<p style="color:#0c1f44;font-size:13px;line-height:1.55"><strong>Verified asking-rent priority range:</strong> ${money(snapshot.financial.conservative)} to ${money(snapshot.financial.upside)}, with a ${money(snapshot.financial.base)} base case.</p>` : ""}<a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;margin-top:12px;background:#0c1f44;color:#fff;text-decoration:none;font-weight:700;border-radius:7px;padding:12px 18px">Open owner briefing</a><p style="color:#687386;font-size:12px;line-height:1.6;margin:24px 0 0;border-top:1px solid #e3e8ef;padding-top:18px">Dwellsy IQ reports advertised asking-market intelligence. It does not measure occupancy, signed leases, concessions, effective rent, or NOI.</p></div></div></body></html>`;
  return { subject, text, html, signalCount: snapshot.attention.length };
}
