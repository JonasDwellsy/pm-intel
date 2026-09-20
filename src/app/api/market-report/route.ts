import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { isLeadBotTrapFilled, readLeadJsonBody } from "@/lib/lead-intake";
import {
  marketReportRequestSchema,
  normalizeMarketReportEmail,
} from "@/lib/market-report";
import {
  buildMarketReportEmail,
  marketPagePath,
} from "@/lib/market-report-email";

const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const body = await readLeadJsonBody(request);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  const parsed = marketReportRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid market and email." }, { status: 422 });
  }

  if (isLeadBotTrapFilled(parsed.data.companyWebsite)) {
    return Response.json({ delivered: true }, { status: 201 });
  }

  const email = normalizeMarketReportEmail(parsed.data.email);
  const market = await prisma.market.findUnique({
    where: { id: parsed.data.marketId },
    select: {
      city: true,
      state: true,
      activeOperatorCount: true,
      operatorCountEligible: true,
      medianDomT12: true,
      marketRentGrowthT12: true,
      pms: {
        select: { dataAsOf: true },
        orderBy: { dataAsOf: "desc" },
        take: 1,
      },
    },
  });

  if (!market) {
    return Response.json({ error: "That market is not available." }, { status: 404 });
  }

  const existing = await prisma.marketReportLead.findUnique({
    where: { marketId_email: { marketId: parsed.data.marketId, email } },
    select: { deliveredAt: true },
  });
  if (
    existing?.deliveredAt &&
    Date.now() - existing.deliveredAt.getTime() < RESEND_WINDOW_MS
  ) {
    return Response.json({ delivered: true }, { status: 200 });
  }

  await prisma.marketReportLead.upsert({
    where: { marketId_email: { marketId: parsed.data.marketId, email } },
    create: {
      marketId: parsed.data.marketId,
      email,
      source: parsed.data.source ?? "homepage_exit_intent",
    },
    update: {
      source: parsed.data.source ?? "homepage_exit_intent",
      status: "pending",
      deliveryError: null,
      requestedAt: new Date(),
    },
  });

  const reportUrl = new URL(marketPagePath(market), appOrigin(request)).toString();
  const message = buildMarketReportEmail(
    { ...market, dataAsOf: market.pms[0]?.dataAsOf ?? null },
    reportUrl
  );
  const result = await sendEmail({ to: email, ...message });

  if (!result.ok) {
    await prisma.marketReportLead.update({
      where: { marketId_email: { marketId: parsed.data.marketId, email } },
      data: { status: "failed", deliveryError: result.error.slice(0, 1000) },
    });
    Sentry.captureMessage("Free market report delivery failed", {
      level: "warning",
      tags: { route: "api/market-report", market_id: parsed.data.marketId },
      extra: { providerError: result.error },
    });
    return Response.json(
      { error: "We could not send the report just now. Please try again." },
      { status: 502 }
    );
  }

  await prisma.marketReportLead.update({
    where: { marketId_email: { marketId: parsed.data.marketId, email } },
    data: {
      status: "delivered",
      providerMessageId: result.id,
      deliveredAt: new Date(),
      deliveryError: null,
    },
  });

  return Response.json({ delivered: true }, { status: 201 });
}
