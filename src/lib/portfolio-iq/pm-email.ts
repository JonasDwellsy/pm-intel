import type { PortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function buildPmBriefEmail(input: {
  recipientName: string | null;
  propertyName: string;
  ownerName: string;
  snapshot: PortfolioIqPmBriefSnapshot;
  briefUrl: string;
  reminder?: boolean;
}) {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hello,";
  const prefix = input.reminder ? "Reminder: " : "";
  const due = input.snapshot.request.responseDueAt
    ? new Date(input.snapshot.request.responseDueAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
  const subject = `${prefix}${input.ownerName} has a question about ${input.propertyName}`;
  const text = `${greeting}\n\n${input.ownerName} shared one property-specific question through Portfolio IQ.\n\n${input.snapshot.issue.headline}\n${input.snapshot.issue.narrative}\n\n${due ? `Response requested by ${due}.\n\n` : ""}Review the evidence and respond: ${input.briefUrl}\n\nThis restricted link contains only the named property's brief. It does not expose the owner's other assets or Operator IQ rankings.`;
  const html = `<div style="background:#f5f7fa;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#24324a"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d7dee8;border-radius:12px;overflow:hidden"><div style="background:#0c1f44;padding:22px 26px;color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8fd1dd">Dwellsy IQ · PM collaboration</div><h1 style="font-size:22px;line-height:1.35;margin:8px 0 0">${escapeHtml(input.propertyName)}</h1></div><div style="padding:26px"><p style="font-size:15px;line-height:1.6;margin:0 0 18px">${escapeHtml(greeting)}</p><p style="font-size:15px;line-height:1.6;margin:0 0 20px">${escapeHtml(input.ownerName)} shared one property-specific question through Portfolio IQ.</p><div style="border-left:4px solid #19758f;background:#eef7f9;padding:16px 18px;margin:0 0 22px"><strong style="display:block;color:#0c1f44;font-size:16px">${escapeHtml(input.snapshot.issue.headline)}</strong><span style="display:block;color:#465166;font-size:14px;line-height:1.6;margin-top:7px">${escapeHtml(input.snapshot.issue.narrative)}</span></div>${due ? `<p style="font-size:13px;color:#687386;margin:0 0 18px"><strong>Response requested by:</strong> ${escapeHtml(due)}</p>` : ""}<a href="${escapeHtml(input.briefUrl)}" style="display:inline-block;background:#0c1f44;color:#fff;text-decoration:none;border-radius:7px;padding:12px 18px;font-size:14px;font-weight:700">Review and respond</a><p style="border-top:1px solid #e3e8ef;color:#687386;font-size:12px;line-height:1.55;margin:24px 0 0;padding-top:18px">This restricted link contains only the named property's brief. It does not expose the owner's other assets or Operator IQ rankings.</p></div></div></div>`;
  return { subject, text, html };
}
