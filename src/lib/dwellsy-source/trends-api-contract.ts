import { z } from "zod";

import { mapDwellsyTrendRows } from "@/lib/dwellsy-source/trends";
import type { MarketIqTrendSeries } from "@/lib/market-iq/report/report";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dwellsyRentTrendsQuerySchema = z.object({
  type: z.enum(["msa", "city", "zip"]),
  location: z.string().trim().min(1),
  period_start: isoDate,
  period_end: isoDate,
  bedrooms: z.number().int().nonnegative().nullable(),
}).strict().refine((query) => query.period_start <= query.period_end, {
  message: "period_start must not be after period_end",
});

export const dwellsyRentTrendRowSchema = z.object({
  month: isoDate,
  bedrooms: z.number().int().nonnegative(),
  address_type: z.enum(["Apartment", "House"]),
  count: z.number().int().nonnegative(),
  trends_value: z.number().positive().finite(),
  rent_change_percentage: z.number().finite().nullable(),
}).strict();

export const dwellsyRentTrendsEnvelopeSchema = z.object({
  request: dwellsyRentTrendsQuerySchema,
  geographyLabel: z.string().trim().min(1),
  response: z.object({
    location: z.string().trim().min(1),
    period: z.object({
      start: isoDate,
      end: isoDate,
    }).strict(),
    rent_stats: z.array(dwellsyRentTrendRowSchema),
    type: z.enum(["msa", "city", "zip"]),
  }).strict(),
}).strict();

export type DwellsyRentTrendsQuery = z.infer<typeof dwellsyRentTrendsQuerySchema>;
export type DwellsyRentTrendRow = z.infer<typeof dwellsyRentTrendRowSchema>;
export type DwellsyRentTrendsEnvelope = z.infer<typeof dwellsyRentTrendsEnvelopeSchema>;

export const DWELLSY_DETAIL_SEGMENTS = [
  "apartment:0",
  "apartment:1",
  "apartment:2",
  "house:2",
  "house:3",
  "house:4",
] as const;

export const DWELLSY_UNSUPPORTED_ROLLUP_SEGMENTS = ["apartment:999", "house:999"] as const;

export const DWELLSY_TRENDS_FIELD_SEMANTICS = {
  rent_change_percentage: {
    interpretation: "year_over_year",
    valuePolicy: "preserve_source_value",
    derivationAllowed: false,
    documentationStatus: "source_confirmation_pending",
  },
} as const;

type DwellsyDetailSegment = typeof DWELLSY_DETAIL_SEGMENTS[number];

function segmentKey(row: DwellsyRentTrendRow): DwellsyDetailSegment | null {
  const key = `${row.address_type.toLowerCase()}:${row.bedrooms}`;
  return DWELLSY_DETAIL_SEGMENTS.includes(key as DwellsyDetailSegment)
    ? key as DwellsyDetailSegment
    : null;
}

export function parseDwellsyRentTrendsEnvelope(input: unknown): DwellsyRentTrendsEnvelope {
  const envelope = dwellsyRentTrendsEnvelopeSchema.parse(input);
  const { request, response } = envelope;
  if (
    response.type !== request.type
    || response.location !== request.location
    || response.period.start !== request.period_start
    || response.period.end !== request.period_end
  ) {
    throw new Error("Dwellsy Trends response identity does not match the request");
  }
  const identities = new Set<string>();
  for (const row of response.rent_stats) {
    if (row.month < request.period_start || row.month > request.period_end) {
      throw new Error(`Dwellsy Trends row ${row.month} falls outside the requested period`);
    }
    if (request.bedrooms !== null && row.bedrooms !== request.bedrooms) {
      throw new Error(`Dwellsy Trends row bedroom ${row.bedrooms} does not match the request`);
    }
    const identity = `${row.month}:${row.address_type}:${row.bedrooms}`;
    if (identities.has(identity)) {
      throw new Error(`Dwellsy Trends response contains a duplicate row for ${identity}`);
    }
    identities.add(identity);
  }
  return envelope;
}

export type DwellsyTrendCoverage = {
  ready: boolean;
  requiredMonth: string;
  missingSegments: DwellsyDetailSegment[];
  unsupportedRollups: readonly ["apartment:999", "house:999"];
};

export function assessDwellsyTrendCoverage(
  envelope: DwellsyRentTrendsEnvelope,
  requiredMonth: string,
): DwellsyTrendCoverage {
  const present = new Set(
    envelope.response.rent_stats
      .filter((row) => row.month === requiredMonth)
      .map(segmentKey)
      .filter((key): key is DwellsyDetailSegment => key !== null),
  );
  const missingSegments = DWELLSY_DETAIL_SEGMENTS.filter((key) => !present.has(key));
  return {
    ready: missingSegments.length === 0,
    requiredMonth,
    missingSegments,
    unsupportedRollups: DWELLSY_UNSUPPORTED_ROLLUP_SEGMENTS,
  };
}

export function mapDwellsyRentTrendsEnvelope(
  input: unknown,
  requiredMonth: string,
): MarketIqTrendSeries[] {
  const envelope = parseDwellsyRentTrendsEnvelope(input);
  const coverage = assessDwellsyTrendCoverage(envelope, requiredMonth);
  if (!coverage.ready) {
    throw new Error(`Dwellsy Trends coverage is incomplete for ${requiredMonth}: ${coverage.missingSegments.join(", ")}`);
  }
  const { request } = envelope;
  return mapDwellsyTrendRows(envelope.response.rent_stats.filter((row) => segmentKey(row) !== null).map((row) => ({
    geography_type: request.type,
    geography_value: request.location,
    geography_label: envelope.geographyLabel,
    address_type: row.address_type,
    bedrooms: row.bedrooms,
    month: row.month,
    observations: row.count,
    rent: row.trends_value,
    // This is an opaque source-provided YoY metric. Do not derive it from rent values.
    year_over_year_pct: row.rent_change_percentage,
    value_basis: "trends_value" as const,
  })));
}

export type DwellsyTrendSyncGeography<T extends "msa" | "city" | "zip"> = {
  type: T;
  location: string;
  geographyLabel: string;
};

export function buildDwellsyTrendSyncPlan(input: {
  msa: DwellsyTrendSyncGeography<"msa">;
  cities: readonly DwellsyTrendSyncGeography<"city">[];
  zipCodes: readonly DwellsyTrendSyncGeography<"zip">[];
  startDate: string;
  endDate: string;
}) {
  const geographies: DwellsyTrendSyncGeography<"msa" | "city" | "zip">[] = [
    input.msa,
    ...input.cities,
    ...input.zipCodes,
  ];
  const executableCalls = geographies.map((geography) => ({
    geographyLabel: geography.geographyLabel,
    request: dwellsyRentTrendsQuerySchema.parse({
      type: geography.type,
      location: geography.location,
      period_start: input.startDate,
      period_end: input.endDate,
      bedrooms: null,
    }),
  }));
  return {
    deliveryMode: "deliberate_snapshot_sync" as const,
    pageRenderFetchAllowed: false as const,
    geographyCount: geographies.length,
    executableDetailCallCount: executableCalls.length,
    requiredRollupCallCount: geographies.length,
    fullParityCallCount: geographies.length * 2,
    executableCalls,
    parityReady: false as const,
    missingCapabilities: [...DWELLSY_UNSUPPORTED_ROLLUP_SEGMENTS],
  };
}

export const DWELLSY_SOURCE_CAPABILITIES = {
  detailedRentTrends: {
    status: "covered",
    transport: "rent_trends",
  },
  allBedroomRollups: {
    status: "unsupported",
    reason: "rent_trends returned no rows for bedrooms=999; aggregate values must not be synthesized from detail rows",
  },
  activeListings: {
    status: "partial",
    reason: "analytics_query is capped at 500 rows; bulk export exists but its required fields and semantics are not verified",
  },
  listingEvents: {
    status: "unsupported",
    reason: "the exposed API does not provide the prior-rent and source-update history required for full fidelity",
  },
} as const;
