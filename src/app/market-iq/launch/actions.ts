"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { sendEmail } from "@/lib/email/send";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { marketIqReportBaseUrl } from "@/lib/market-iq/report/delivery.server";
import { buildMarketIqReportEmail } from "@/lib/market-iq/report/email";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  return user?.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses[0]?.emailAddress
    ?? null;
}

function validEmail(value: string | null | undefined): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export async function sendMarketIqLaunchTest(formData: FormData): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access, user] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    currentUser(),
  ]);
  const email = primaryEmail(user);
  const confirmation = String(formData.get("confirmation") ?? "");
  if (!userId || !organizationId || !email || confirmation !== email) {
    throw new Error("Confirm your signed-in email address before sending the test.");
  }
  if (!access.hasProduct || !access.capabilities.sendReports || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    throw new Error("Market IQ Client Advisory access is required for a test delivery.");
  }

  const report = await prisma.marketIqReport.findFirst({
    where: {
      organizationId,
      marketId: CLEVELAND_MARKET_ID,
      status: "published",
      generatedBy: { notIn: ["preview-bootstrap", "market-iq-baseline"] },
    },
    orderBy: { publishedAt: "desc" },
    select: { id: true, publicToken: true, snapshot: true },
  });
  if (!report) redirect("/market-iq/launch?test=no_report");
  const snapshot = parseMarketIqReportSnapshot(report.snapshot);
  if (!snapshot) redirect("/market-iq/launch?test=invalid_report");

  const delivery = await prisma.marketIqTestDelivery.create({
    data: { organizationId, reportId: report.id, requestedByUserId: userId, recipientEmail: email },
    select: { id: true },
  });
  const reportUrl = `${marketIqReportBaseUrl()}/reports/market/${report.publicToken}`;
  const message = buildMarketIqReportEmail({
    recipientName: user?.firstName || "Market IQ reviewer",
    recipientKind: "client",
    report: snapshot,
    reportUrl,
    pdfUrl: `${reportUrl}/pdf`,
  });
  const testNotice = `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid #f1c27d;background:#fff8eb;color:#5b3b12;font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><strong>Market IQ test delivery</strong><br>This verification email was sent only to your signed-in address. No client or prospect received it.</div>`;

  const result = await sendEmail({
    to: email,
    fromName: snapshot.brand.displayName,
    replyTo: validEmail(snapshot.brand.contactEmail) ? snapshot.brand.contactEmail : undefined,
    subject: `[Test] ${message.subject}`,
    html: `${testNotice}${message.html}`,
    text: `MARKET IQ TEST DELIVERY\nThis verification email was sent only to your signed-in address. No client or prospect received it.\n\n${message.text}`,
    customArgs: {
      dwellsy_kind: "market_iq_test_delivery",
      dwellsy_record_id: delivery.id,
      dwellsy_report_id: report.id,
    },
  });
  await prisma.marketIqTestDelivery.update({
    where: { id: delivery.id },
    data: result.ok
      ? { status: "accepted", providerId: result.id || null, sentAt: new Date(), error: null }
      : { status: "failed", error: result.error.slice(0, 1_000) },
  });
  revalidatePath("/market-iq/launch");
  redirect(`/market-iq/launch?test=${result.ok ? "accepted" : "failed"}`);
}
