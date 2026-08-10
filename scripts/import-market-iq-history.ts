/**
 * Repeatable Market IQ historical-export loader.
 *
 * Dry run and schema profile (default):
 *   npm run market-iq:import-history -- --file /path/to/export.csv.zip --available-through 2026-07-31
 *
 * Apply to the currently configured database only after reviewing the profile:
 *   npm run market-iq:import-history -- --file /path/to/export.csv.zip --available-through 2026-07-31 --apply
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, extname } from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient, type Prisma } from "@prisma/client";

const MARKET_ID = "cleveland-elyria-mentor-oh";
const BATCH_SIZE = 750;

const aliases = {
  sourceRecordId: ["listing_id", "listingid", "id", "record_id", "rental_id", "property_listing_id"],
  listingStatus: ["status", "listing_status", "active_status", "is_active"],
  address: ["address", "street_address", "full_address", "address_1", "street"],
  city: ["city", "municipality", "locality"],
  state: ["state", "state_code", "state_abbreviation"],
  postalCode: ["zip", "zipcode", "zip_code", "postal_code"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lon", "lng"],
  askingRent: ["rent", "asking_rent", "price", "monthly_rent", "rent_amount"],
  squareFeet: ["square_feet", "squarefeet", "sqft", "square_footage", "living_area"],
  bedrooms: ["bedrooms", "beds", "bedroom_count"],
  bathrooms: ["bathrooms", "baths", "bathroom_count"],
  propertyType: ["property_type", "propertytype", "home_type", "listing_type", "rental_type"],
  communityName: ["community", "community_name", "property_name", "building_name"],
  ownerName: ["owner", "owner_name", "ownership", "management_company", "company_name"],
  activatedAt: ["activated_at", "activation_time", "active_date", "listed_at", "date_listed", "created_at"],
  deactivatedAt: ["deactivated_at", "deactivation_time", "inactive_date", "delisted_at", "date_removed"],
} as const;

type RawRow = Record<string, unknown>;
type Field = keyof typeof aliases;

function args() {
  const values = process.argv.slice(2);
  const read = (flag: string) => {
    const index = values.indexOf(flag);
    return index >= 0 ? values[index + 1] : undefined;
  };
  return { file: read("--file"), availableThrough: read("--available-through"), apply: values.includes("--apply") };
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function csvFromFile(path: string) {
  if (extname(path).toLowerCase() !== ".zip") return readFileSync(path, "utf8");
  const entries = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((entry) => entry.toLowerCase().endsWith(".csv"));
  if (entries.length !== 1) throw new Error(`Expected one CSV in the archive; found ${entries.length}.`);
  return execFileSync("unzip", ["-p", path, entries[0]], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

function findColumns(headers: string[]) {
  const normalized = new Map(headers.map((header) => [normalizedHeader(header), header]));
  return Object.fromEntries(
    Object.entries(aliases).map(([field, candidates]) => [field, candidates.map((candidate) => normalized.get(candidate)).find(Boolean)])
  ) as Record<Field, string | undefined>;
}

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result : null;
}

function number(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(result) ? result : null;
}

function date(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)));
  }
  const result = new Date(String(value));
  return Number.isNaN(result.getTime()) ? null : result;
}

function propertyType(value: unknown) {
  const result = (text(value) || "other").toLowerCase();
  if (/apartment|multifamily|multi_family|unit/.test(result)) return "apartment";
  if (/house|single.family|sfr|home/.test(result)) return "house";
  return "other";
}

function value(row: RawRow, columns: Record<Field, string | undefined>, field: Field) {
  const column = columns[field];
  return column ? row[column] : undefined;
}

function sourceRecordId(row: RawRow, columns: Record<Field, string | undefined>) {
  const supplied = text(value(row, columns, "sourceRecordId"));
  if (supplied) return supplied;
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

async function main() {
  const options = args();
  if (!options.file) throw new Error("--file is required.");
  if (options.apply && !options.availableThrough) throw new Error("--available-through is required with --apply.");

  const archive = readFileSync(options.file);
  const checksum = createHash("sha256").update(archive).digest("hex");
  const csv = csvFromFile(options.file);
  const workbook = XLSX.read(csv, { type: "string", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const columns = findColumns(headers);
  const required: Field[] = ["propertyType", "activatedAt"];
  const missingRequired = required.filter((field) => !columns[field]);

  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    file: basename(options.file),
    checksum,
    rowCount: rows.length,
    headers,
    mappedColumns: columns,
    missingRequired,
    sample: rows.slice(0, 2),
  }, null, 2));

  if (missingRequired.length) {
    throw new Error(`Required columns were not recognized: ${missingRequired.join(", ")}. Add aliases before applying.`);
  }
  if (!options.apply) return;

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.marketIqDataImport.findUnique({ where: { sourceChecksum: checksum } });
    if (existing) {
      console.log(`Import ${existing.id} already represents this exact file. No records were added.`);
      return;
    }
    const dataImport = await prisma.marketIqDataImport.create({
      data: {
        sourceKind: "historical_export",
        sourceName: "Cleveland historical listing export",
        sourceFilename: basename(options.file),
        sourceChecksum: checksum,
        marketId: MARKET_ID,
        availableThrough: new Date(`${options.availableThrough}T00:00:00.000Z`),
        status: "loading",
        metadata: JSON.stringify({ headers, mappedColumns: columns }),
      },
    });

    try {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch: Prisma.MarketIqListingCreateManyInput[] = rows.slice(start, start + BATCH_SIZE).map((row) => ({
          importId: dataImport.id,
          sourceRecordId: sourceRecordId(row, columns),
          marketId: MARKET_ID,
          listingStatus: text(value(row, columns, "listingStatus")),
          address: text(value(row, columns, "address")),
          city: text(value(row, columns, "city")),
          state: text(value(row, columns, "state")),
          postalCode: text(value(row, columns, "postalCode")),
          latitude: number(value(row, columns, "latitude")),
          longitude: number(value(row, columns, "longitude")),
          askingRent: number(value(row, columns, "askingRent")),
          squareFeet: number(value(row, columns, "squareFeet")),
          bedrooms: number(value(row, columns, "bedrooms")),
          bathrooms: number(value(row, columns, "bathrooms")),
          propertyType: propertyType(value(row, columns, "propertyType")),
          communityName: text(value(row, columns, "communityName")),
          ownerName: text(value(row, columns, "ownerName")),
          activatedAt: date(value(row, columns, "activatedAt")),
          deactivatedAt: date(value(row, columns, "deactivatedAt")),
          rawData: JSON.stringify(row),
        }));
        await prisma.marketIqListing.createMany({ data: batch, skipDuplicates: true });
        console.log(`Loaded ${Math.min(start + batch.length, rows.length)} of ${rows.length}`);
      }
      await prisma.marketIqDataImport.update({
        where: { id: dataImport.id },
        data: { status: "complete", recordCount: rows.length },
      });
      console.log(`Import ${dataImport.id} completed with ${rows.length} source rows.`);
    } catch (error) {
      await prisma.marketIqDataImport.delete({ where: { id: dataImport.id } });
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
