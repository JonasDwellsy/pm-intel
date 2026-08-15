import "server-only";
import { sendEmail } from "@/lib/email/send";
import { buildMarketIqReportEmail } from "@/lib/market-iq/report/email";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function marketIqReportBaseUrl() {
  if (process.env.MARKET_IQ_PUBLIC_URL) return process.env.MARKET_IQ_PUBLIC_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

export type MarketIqDeliveryResult =
  | { status: "sent"; sendId: string }
  | { status: "already_sent"; sendId: string }
  | { status: "suppressed"; reason: string }
  | { status: "failed"; sendId: string; error: string };

export async function deliverMarketIqReportToRecipient(input: {
  organizationId: string;
  reportId: string;
  recipientId: string;
}): Promise<MarketIqDeliveryResult> {
  const [report, recipient, prior] = await Promise.all([
    prisma.marketIqReport.findFirst({
      where: { id: input.reportId, organizationId: input.organizationId, status: "published" },
      select: { id: true, publicToken: true, snapshot: true },
    }),
    prisma.marketIqReportRecipient.findFirst({
      where: { id: input.recipientId, organizationId: input.organizationId },
      select: { id: true, name: true, email: true, kind: true, emailStatus: true, suppressionReason: true },
    }),
    prisma.marketIqReportSend.findFirst({
      where: {
        organizationId: input.organizationId,
        reportId: input.reportId,
        recipientId: input.recipientId,
        OR: [{ deliveryStatus: "sent" }, { deliveredAt: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  if (prior) return { status: "already_sent", sendId: prior.id };
  if (!report || !recipient) throw new Error("Published report or recipient not found.");
  if (recipient.emailStatus === "suppressed") {
    return { status: "suppressed", reason: recipient.suppressionReason ?? "Recipient is suppressed." };
  }
  if (!validEmail(recipient.email) || !["client", "prospect"].includes(recipient.kind)) {
    return { status: "suppressed", reason: "Recipient email or relationship is invalid." };
  }
  const snapshot = parseMarketIqReportSnapshot(report.snapshot);
  if (!snapshot) throw new Error("The immutable report snapshot is invalid.");
  const delivery = await prisma.marketIqReportSend.create({
    data: { organizationId: input.organizationId, reportId: report.id, recipientId: recipient.id },
    select: { id: true },
  });
  const reportUrl = `${marketIqReportBaseUrl()}/reports/market/${report.publicToken}`;
  const message = buildMarketIqReportEmail({
    recipientName: recipient.name,
    recipientKind: recipient.kind as "client" | "prospect",
    report: snapshot,
    reportUrl,
    pdfUrl: `${reportUrl}/pdf`,
  });
  const result = await sendEmail({
    to: recipient.email,
    fromName: snapshot.brand.displayName,
    replyTo: snapshot.brand.contactEmail && validEmail(snapshot.brand.contactEmail) ? snapshot.brand.contactEmail : undefined,
    ...message,
    customArgs: {
      dwellsy_kind: "market_iq_report",
      dwellsy_record_id: delivery.id,
      dwellsy_report_id: report.id,
    },
  });
  await prisma.marketIqReportSend.update({
    where: { id: delivery.id },
    data: result.ok
      ? { deliveryStatus: "sent", deliveryProviderId: result.id || null, deliveryError: null, sentAt: new Date() }
      : { deliveryStatus: "failed", deliveryError: result.error.slice(0, 1_000) },
  });
  return result.ok
    ? { status: "sent", sendId: delivery.id }
    : { status: "failed", sendId: delivery.id, error: result.error };
}
