"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { sendEmail } from "@/lib/email/send";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildClevelandComposerPreview, type MarketIqReportBrandInput } from "@/lib/market-iq/report/composer.server";
import { canAccessMarketIqReportComposer } from "@/lib/market-iq/report/access";
import { buildMarketIqReportEmail } from "@/lib/market-iq/report/email";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { compareMarketIqEditions } from "@/lib/market-iq/report/edition-comparison";
import {
  applyMarketIqReportScope,
  buildMarketIqCoveragePreflight,
  parseMarketIqScopeFormData,
} from "@/lib/market-iq/report/scope";
import { prisma } from "@/lib/prisma";

function clipped(value: FormDataEntryValue | null, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function optionalUrl(value: FormDataEntryValue | null) {
  const raw = clipped(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function color(value: FormDataEntryValue | null, fallback: string) {
  const raw = clipped(value, 7);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : fallback;
}

async function authorizedMarketIqContext() {
  const previewEnabled = marketIqPreviewEnabled();
  if (!previewEnabled) return null;
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  const allowed = canAccessMarketIqReportComposer({
    previewEnabled,
    userId,
    organizationId,
    hasProduct: access.hasProduct,
    marketEntitled: isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID),
  });
  if (!allowed || !userId || !organizationId) return null;
  return { userId, organizationId };
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function reportBaseUrl() {
  if (process.env.MARKET_IQ_PUBLIC_URL) return process.env.MARKET_IQ_PUBLIC_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function publishMarketIqReport(formData: FormData): Promise<void> {
  const context = await authorizedMarketIqContext();
  if (!context) throw new Error("Market IQ report access is unavailable.");
  if (clipped(formData.get("marketId"), 80) !== CLEVELAND_MARKET_ID) throw new Error("The selected market is not available.");
  const displayName = clipped(formData.get("displayName"), 120);
  if (displayName.length < 2) throw new Error("Enter the PM brand name shown to the client.");
  const contactEmail = clipped(formData.get("contactEmail"), 254) || null;
  if (contactEmail && (!contactEmail.includes("@") || contactEmail.includes(" "))) throw new Error("Enter a valid contact email.");
  const logoRaw = clipped(formData.get("logoUrl"), 500);
  const websiteRaw = clipped(formData.get("websiteUrl"), 500);
  const brand: MarketIqReportBrandInput = {
    displayName,
    logoUrl: optionalUrl(formData.get("logoUrl")),
    primaryColor: color(formData.get("primaryColor"), "#173B57"),
    accentColor: color(formData.get("accentColor"), "#B96D3A"),
    contactName: clipped(formData.get("contactName"), 120) || null,
    contactEmail,
    contactPhone: clipped(formData.get("contactPhone"), 40) || null,
    websiteUrl: optionalUrl(formData.get("websiteUrl")),
  };
  if (logoRaw && !brand.logoUrl) throw new Error("Logo URL must be a valid HTTPS address.");
  if (websiteRaw && !brand.websiteUrl) throw new Error("Website URL must be a valid HTTPS address.");

  const now = new Date();
  const selection = parseMarketIqScopeFormData(formData);
  if (!selection.cities.length && !selection.zipCodes.length) throw new Error("Select at least one city or ZIP code.");
  if (!selection.segments.length) throw new Error("Select at least one product segment.");
  const preview = await buildClevelandComposerPreview(brand);
  const snapshot = applyMarketIqReportScope(preview.snapshot, selection);
  const coverage = buildMarketIqCoveragePreflight(snapshot);
  if (!coverage.canPublish) throw new Error("At least one selected geography and segment must have a fresh Trends IQ value before publishing.");
  const priorReport = await prisma.marketIqReport.findFirst({
    where: { organizationId: context.organizationId, marketId: CLEVELAND_MARKET_ID, status: "published" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, periodLabel: true, publishedAt: true, snapshot: true },
  });
  const priorSnapshot = priorReport ? parseMarketIqReportSnapshot(priorReport.snapshot) : null;
  const priorEdition = priorReport && priorSnapshot ? {
    id: priorReport.id,
    periodLabel: priorReport.periodLabel,
    publishedAt: priorReport.publishedAt?.toISOString() ?? null,
    snapshot: applyMarketIqReportScope(priorSnapshot, selection),
  } : null;
  const frozenSnapshot = {
    ...snapshot,
    generatedAt: now.toISOString(),
    brand,
    editionComparison: compareMarketIqEditions(snapshot, priorEdition),
    editorial: {
      headline: clipped(formData.get("editorialHeadline"), 120) || null,
      introduction: clipped(formData.get("editorialIntroduction"), 700) || null,
      reviewedAt: now.toISOString(),
      reviewedBy: "PM reviewer",
    },
  };
  const publicToken = randomBytes(24).toString("base64url");
  const report = await prisma.$transaction(async (tx) => {
    const brandProfile = await tx.organizationBrandProfile.upsert({
      where: { organizationId: context.organizationId },
      create: { organizationId: context.organizationId, ...brand },
      update: brand,
    });
    return tx.marketIqReport.create({
      data: {
        organizationId: context.organizationId,
        marketId: CLEVELAND_MARKET_ID,
        periodLabel: `${snapshot.scope.periodStart} to ${snapshot.scope.periodEnd}`,
        publicToken,
        status: "published",
        scope: JSON.stringify(snapshot.scope),
        snapshot: JSON.stringify(frozenSnapshot),
        subjectAddress: null,
        brandProfileId: brandProfile.id,
        generatedBy: context.userId,
        publishedAt: now,
      },
      select: { id: true },
    });
  });
  revalidatePath("/market-iq/report");
  redirect(`/market-iq/report?published=${report.id}`);
}

export async function revokeMarketIqReport(formData: FormData): Promise<void> {
  const context = await authorizedMarketIqContext();
  const reportId = clipped(formData.get("reportId"), 80);
  if (!context || !reportId) throw new Error("Market IQ report update is unavailable.");
  const report = await prisma.marketIqReport.findFirst({
    where: { id: reportId, organizationId: context.organizationId },
    select: { id: true, status: true },
  });
  if (!report) throw new Error("Report not found.");
  if (report.status === "published") {
    await prisma.marketIqReport.update({ where: { id: report.id }, data: { status: "revoked" } });
  }
  revalidatePath("/market-iq/report");
}

export async function sendMarketIqReport(formData: FormData): Promise<void> {
  const context = await authorizedMarketIqContext();
  const reportId = clipped(formData.get("reportId"), 80);
  const recipientName = clipped(formData.get("recipientName"), 120);
  const recipientEmail = clipped(formData.get("recipientEmail"), 254).toLowerCase();
  const recipientKind = clipped(formData.get("recipientKind"), 20);
  if (!context || !reportId || !recipientName || !validEmail(recipientEmail) || !["client", "prospect"].includes(recipientKind)) {
    throw new Error("Enter a valid client or prospect recipient before sending.");
  }

  const report = await prisma.marketIqReport.findFirst({
    where: { id: reportId, organizationId: context.organizationId, marketId: CLEVELAND_MARKET_ID },
    select: { id: true, publicToken: true, status: true, snapshot: true },
  });
  const snapshot = report ? parseMarketIqReportSnapshot(report.snapshot) : null;
  if (!report || report.status !== "published" || !snapshot) throw new Error("Published Market IQ report not found.");

  const recipient = await prisma.marketIqReportRecipient.upsert({
    where: { organizationId_email: { organizationId: context.organizationId, email: recipientEmail } },
    create: { organizationId: context.organizationId, name: recipientName, email: recipientEmail, kind: recipientKind },
    update: { name: recipientName, kind: recipientKind },
  });
  const delivery = await prisma.marketIqReportSend.create({
    data: { organizationId: context.organizationId, reportId: report.id, recipientId: recipient.id },
    select: { id: true },
  });
  const baseUrl = reportBaseUrl();
  const reportUrl = `${baseUrl}/reports/market/${report.publicToken}`;
  const message = buildMarketIqReportEmail({
    recipientName,
    recipientKind: recipientKind as "client" | "prospect",
    report: snapshot,
    reportUrl,
    pdfUrl: `${reportUrl}/pdf`,
  });
  const result = await sendEmail({
    to: recipientEmail,
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
  revalidatePath("/market-iq/report");
  redirect(`/market-iq/report?published=${report.id}&delivery=${result.ok ? "sent" : "failed"}`);
}
