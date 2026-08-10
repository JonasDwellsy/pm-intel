import { timingSafeEqual } from "node:crypto";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MARKET_ID = "cleveland-elyria-mentor-oh";
const MAX_BATCH_SIZE = 1_000;

function authorized(request: Request) {
  const configured = process.env.MARKET_IQ_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

export async function POST(request: Request) {
  if (!marketIqPreviewEnabled() || !authorized(request)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 422 });
  const input = body as Record<string, unknown>;
  const records = Array.isArray(input.records) ? input.records : null;
  if (
    typeof input.sourceChecksum !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.sourceChecksum) ||
    !records ||
    records.length === 0 ||
    records.length > MAX_BATCH_SIZE ||
    typeof input.availableThrough !== "string" ||
    typeof input.analysisCutoff !== "string"
  ) {
    return Response.json({ error: "Invalid import batch." }, { status: 422 });
  }

  const dataImport = await prisma.marketIqDataImport.upsert({
    where: { sourceChecksum: input.sourceChecksum },
    create: {
      sourceKind: "historical_export",
      sourceName: "Cleveland historical listing export",
      sourceFilename: optionalText(input.sourceFilename),
      sourceChecksum: input.sourceChecksum,
      marketId: MARKET_ID,
      availableThrough: new Date(`${input.availableThrough}T00:00:00.000Z`),
      status: "loading",
      metadata: JSON.stringify({
        headers: Array.isArray(input.headers) ? input.headers : [],
        mappedColumns: input.mappedColumns && typeof input.mappedColumns === "object" ? input.mappedColumns : {},
        analysisCutoff: input.analysisCutoff,
      }),
    },
    update: {},
  });
  if (dataImport.status === "complete") {
    return Response.json({ importId: dataImport.id, alreadyComplete: true, recordCount: dataImport.recordCount });
  }

  const normalized = records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const row = record as Record<string, unknown>;
    if (typeof row.sourceRecordId !== "string" || !row.sourceRecordId) return [];
    return [{
      importId: dataImport.id,
      sourceRecordId: row.sourceRecordId,
      marketId: MARKET_ID,
      listingStatus: optionalText(row.listingStatus),
      address: optionalText(row.address),
      city: optionalText(row.city),
      state: optionalText(row.state),
      postalCode: optionalText(row.postalCode),
      latitude: optionalNumber(row.latitude),
      longitude: optionalNumber(row.longitude),
      askingRent: optionalNumber(row.askingRent),
      squareFeet: optionalNumber(row.squareFeet),
      bedrooms: optionalNumber(row.bedrooms),
      bathrooms: optionalNumber(row.bathrooms),
      propertyType: optionalText(row.propertyType) || "other",
      communityName: optionalText(row.communityName),
      ownerName: optionalText(row.ownerName),
      activatedAt: optionalDate(row.activatedAt),
      deactivatedAt: optionalDate(row.deactivatedAt),
      rawData: typeof row.rawData === "string" ? row.rawData : "{}",
    }];
  });
  if (normalized.length !== records.length) {
    return Response.json({ error: "One or more records are invalid." }, { status: 422 });
  }

  await prisma.marketIqListing.createMany({ data: normalized, skipDuplicates: true });
  const persistedCount = await prisma.marketIqListing.count({ where: { importId: dataImport.id } });
  const final = input.final === true;
  const expectedRecordCount = typeof input.expectedRecordCount === "number" ? input.expectedRecordCount : null;
  if (final && expectedRecordCount !== persistedCount) {
    return Response.json(
      { error: `Final count mismatch: expected ${expectedRecordCount}, persisted ${persistedCount}.`, importId: dataImport.id },
      { status: 409 }
    );
  }
  if (final) {
    await prisma.marketIqDataImport.update({
      where: { id: dataImport.id },
      data: { status: "complete", recordCount: persistedCount },
    });
  }
  return Response.json({ importId: dataImport.id, persistedCount, complete: final });
}
