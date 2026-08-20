import clevelandZctaCenters from "@/data/market-iq/cleveland-zcta-centers.json";

const PRIMARY_CITY_BY_ZIP: Record<string, string> = {
  "44052": "Lorain", "44094": "Willoughby", "44102": "Cleveland", "44105": "Cleveland",
  "44106": "Cleveland", "44107": "Lakewood", "44108": "Cleveland", "44109": "Cleveland",
  "44110": "Cleveland", "44112": "Cleveland", "44113": "Cleveland", "44114": "Cleveland",
  "44115": "Cleveland", "44118": "Cleveland Heights", "44120": "Cleveland", "44121": "South Euclid",
  "44123": "Euclid", "44125": "Garfield Heights", "44128": "Cleveland", "44130": "Parma",
  "44137": "Maple Heights",
};

export const CLEVELAND_ZIP_CENTERS: Record<string, {
  latitude: number;
  longitude: number;
  primaryCity: string | null;
}> = Object.fromEntries(
  Object.entries(clevelandZctaCenters).map(([zip, center]) => [
    zip,
    { ...center, primaryCity: PRIMARY_CITY_BY_ZIP[zip] ?? null },
  ]),
);
