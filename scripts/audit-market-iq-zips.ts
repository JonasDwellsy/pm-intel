import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type FeatureCollection = {
  features?: Array<{ properties?: { ZCTA5?: string | number } }>;
};

const markets = ["cleveland", "columbus", "san-francisco", "san-jose"] as const;
const strict = process.argv.includes("--strict");
let hasMissingGeometry = false;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

for (const market of markets) {
  const configured = new Set(readJson<string[]>(`src/data/market-iq/${market}-msa-zips.json`).map(String));
  const centers = new Set(Object.keys(readJson<Record<string, unknown>>(`src/data/market-iq/${market}-zcta-centers.json`)));
  const boundaries = readJson<FeatureCollection>(`public/data/${market}-zcta.geojson`);
  const polygons = new Set(
    (boundaries.features ?? [])
      .map((feature) => feature.properties?.ZCTA5)
      .filter((value): value is string | number => value !== undefined && value !== null)
      .map(String),
  );

  const missingCenters = [...configured].filter((zip) => !centers.has(zip)).sort();
  const missingPolygons = [...configured].filter((zip) => !polygons.has(zip)).sort();
  const extraCenters = [...centers].filter((zip) => !configured.has(zip)).sort();
  const extraPolygons = [...polygons].filter((zip) => !configured.has(zip)).sort();

  if (missingCenters.length > 0 || missingPolygons.length > 0) hasMissingGeometry = true;

  console.log(`\n${market}`);
  console.log(`  configured: ${configured.size}; centers: ${centers.size}; polygons: ${polygons.size}`);
  console.log(`  missing centers: ${missingCenters.length ? missingCenters.join(", ") : "none"}`);
  console.log(`  missing polygons: ${missingPolygons.length ? missingPolygons.join(", ") : "none"}`);
  console.log(`  extra centers: ${extraCenters.length ? extraCenters.join(", ") : "none"}`);
  console.log(`  extra polygons: ${extraPolygons.length ? extraPolygons.join(", ") : "none"}`);
}

if (strict && hasMissingGeometry) {
  console.error("\nZIP geometry audit failed: at least one configured ZIP lacks a center or polygon.");
  process.exitCode = 1;
}
