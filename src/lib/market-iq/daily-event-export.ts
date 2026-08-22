import type { MarketIqDailyEventHeadline } from "@/lib/market-iq/daily-events";

const UTF_8_BOM = "\uFEFF";

const COLUMNS = [
  "edition_source_as_of",
  "observed_event_total",
  "retained_record_total",
  "exported_matching_record_total",
  "retained_records_partial",
  "event_id",
  "event_type",
  "observed_at",
  "address",
  "city",
  "zip",
  "property_type",
  "bedrooms",
  "current_asking_rent",
  "previous_asking_rent",
  "asking_rent_change",
  "listing_age_days",
  "concession_type",
  "concession_label",
  "concession_evidence",
  "source_listing_url",
] as const;

type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function marketSlug(value: string) {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "market";
}

function dateInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export type MarketIqDailyEventCsvInput = {
  headlines: MarketIqDailyEventHeadline[];
  marketName: string;
  timeZone: string;
  editionAsOf: string;
  observedEventTotal: number;
  retainedRecordTotal: number;
  retainedRecordsPartial: boolean;
};

export function buildMarketIqDailyEventCsv(input: MarketIqDailyEventCsvInput) {
  const exportedMatchingRecordTotal = input.headlines.length;
  const rows = input.headlines.map((headline) => {
    const event = headline.event;
    const previousRent = event.eventType === "price_change" ? event.previousRent : null;
    const listingAgeDays = event.eventType === "delisting" || event.eventType === "aging_threshold"
      ? event.listingAgeDays
      : null;
    const concession = event.eventType === "concession" ? event.concession : null;
    return [
      input.editionAsOf,
      input.observedEventTotal,
      input.retainedRecordTotal,
      exportedMatchingRecordTotal,
      input.retainedRecordsPartial,
      event.id,
      event.eventType,
      headline.observedAt,
      event.address,
      event.city,
      event.zip,
      event.propertyType,
      event.bedrooms,
      event.askingRent,
      previousRent,
      previousRent === null ? null : event.askingRent - previousRent,
      listingAgeDays,
      concession?.kind,
      concession?.label,
      concession?.evidence,
      event.listingUrl,
    ].map(csvCell).join(",");
  });

  return {
    content: `${UTF_8_BOM}${COLUMNS.join(",")}\r\n${rows.join("\r\n")}${rows.length ? "\r\n" : ""}`,
    filename: `market-iq-${marketSlug(input.marketName)}-${dateInTimeZone(input.editionAsOf, input.timeZone)}-filtered-retained-events.csv`,
    rowCount: exportedMatchingRecordTotal,
  };
}
