import { createHash, timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";
import { buildTrendAlertCandidates } from "@/lib/market-iq/alerts";

export const dynamic = "force-dynamic";
const MARKET_ID = "cleveland-elyria-mentor-oh";
const VALID_GEOGRAPHIES = new Set(["msa", "city", "zip"]);

type NormalizedTrendRow = {
  month: Date;
  propertyType: string;
  bedrooms: number;
  observations: number;
  askingRent: number;
  yearOverYearPct: number | null;
};

function alertRowsFor(
  sourceImportId: string,
  geographyType: string,
  geographyValue: string,
  rows: NormalizedTrendRow[]
) {
  return buildTrendAlertCandidates(rows).map((alert) => {
    const fingerprint = createHash("sha256").update(JSON.stringify({
      marketId: MARKET_ID,
      geographyType,
      geographyValue,
      propertyType: alert.propertyType,
      bedrooms: alert.bedrooms,
      signalType: alert.signalType,
      observedMonth: alert.observedMonth.toISOString(),
    })).digest("hex");
    return {
      ...alert,
      fingerprint,
      marketId: MARKET_ID,
      sourceImportId,
      geographyType,
      geographyValue,
    };
  });
}

async function authorized(request: Request) {
  const configured = process.env.MARKET_IQ_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (configured && supplied) {
    const left = Buffer.from(configured);
    const right = Buffer.from(supplied);
    if (left.length === right.length && timingSafeEqual(left, right)) return true;
  }
  const { userId } = await auth();
  return isAdminUser(userId);
}

export async function POST(request: Request) {
  if (!marketIqPreviewEnabled() || !(await authorized(request))) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const records = Array.isArray(body?.records) ? body.records : [];
  if (
    !body ||
    typeof body.geographyType !== "string" ||
    !VALID_GEOGRAPHIES.has(body.geographyType) ||
    typeof body.geographyValue !== "string" ||
    !body.geographyValue ||
    records.length === 0 ||
    records.length > 1_000
  ) {
    return Response.json({ error: "Invalid trend snapshot." }, { status: 422 });
  }
  const normalized = records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const row = record as Record<string, unknown>;
    const month = typeof row.month === "string" ? new Date(`${row.month.slice(0, 10)}T00:00:00.000Z`) : null;
    const propertyType = typeof row.propertyType === "string" ? row.propertyType.toLowerCase() : "";
    if (
      !month || Number.isNaN(month.getTime()) ||
      !["apartment", "house"].includes(propertyType) ||
      !Number.isInteger(row.bedrooms) ||
      !Number.isInteger(row.observations) ||
      typeof row.askingRent !== "number" || !Number.isFinite(row.askingRent)
    ) return [];
    return {
      month,
      propertyType,
      bedrooms: row.bedrooms as number,
      observations: row.observations as number,
      askingRent: row.askingRent,
      yearOverYearPct: typeof row.yearOverYearPct === "number" && Number.isFinite(row.yearOverYearPct) ? row.yearOverYearPct : null,
    };
  });
  if (normalized.length !== records.length) {
    return Response.json({ error: "One or more trend records are invalid." }, { status: 422 });
  }
  const checksum = createHash("sha256").update(JSON.stringify({
    geographyType: body.geographyType,
    geographyValue: body.geographyValue,
    records: normalized.map((row) => ({ ...row, month: row.month.toISOString() })),
  })).digest("hex");
  const existing = await prisma.marketIqDataImport.findUnique({ where: { sourceChecksum: checksum } });
  if (existing?.status === "complete") {
    const existingRows = await prisma.marketIqTrendObservation.findMany({
      where: { importId: existing.id },
      select: {
        month: true,
        propertyType: true,
        bedrooms: true,
        observations: true,
        askingRent: true,
        yearOverYearPct: true,
      },
    });
    const alertRows = alertRowsFor(
      existing.id,
      body.geographyType,
      body.geographyValue,
      existingRows
    );
    const inserted = await prisma.marketIqAlert.createMany({ data: alertRows, skipDuplicates: true });
    return Response.json({
      importId: existing.id,
      alreadyComplete: true,
      recordCount: existing.recordCount,
      alertCount: inserted.count,
    });
  }
  const latestMonth = normalized.reduce((latest, row) => row.month > latest ? row.month : latest, normalized[0].month);
  const dataImport = await prisma.marketIqDataImport.create({
    data: {
      sourceKind: "trends",
      sourceName: "Dwellsy IQ Rent Trends",
      sourceChecksum: checksum,
      marketId: MARKET_ID,
      availableThrough: latestMonth,
      recordCount: normalized.length,
      status: "loading",
      metadata: JSON.stringify({ geographyType: body.geographyType, geographyValue: body.geographyValue }),
    },
  });
  const alertRows = alertRowsFor(
    dataImport.id,
    body.geographyType,
    body.geographyValue,
    normalized
  );
  await prisma.$transaction([
    prisma.marketIqTrendObservation.createMany({
      data: normalized.map((row) => ({
        ...row,
        importId: dataImport.id,
        marketId: MARKET_ID,
        geographyType: body.geographyType as string,
        geographyValue: body.geographyValue as string,
      })),
    }),
    prisma.marketIqAlert.createMany({ data: alertRows, skipDuplicates: true }),
    prisma.marketIqDataImport.update({ where: { id: dataImport.id }, data: { status: "complete" } }),
  ]);
  return Response.json({ importId: dataImport.id, recordCount: normalized.length, alertCount: alertRows.length, complete: true });
}
