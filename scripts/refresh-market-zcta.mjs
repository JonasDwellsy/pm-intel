import fs from "node:fs/promises";

const [slug, marketName] = process.argv.slice(2);
if (!slug || !marketName) throw new Error("Usage: node scripts/refresh-market-zcta.mjs <slug> <market-name>");

const zips = JSON.parse(await fs.readFile(new URL(`../src/data/market-iq/${slug}-msa-zips.json`, import.meta.url), "utf8"));
const endpoint = new URL("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/4/query");
endpoint.searchParams.set("where", `ZCTA5 IN (${zips.map((zip) => `'${zip}'`).join(",")})`);
endpoint.searchParams.set("outFields", "ZCTA5,GEOID,CENTLAT,CENTLON");
endpoint.searchParams.set("returnGeometry", "true");
endpoint.searchParams.set("outSR", "4326");
endpoint.searchParams.set("geometryPrecision", "5");
endpoint.searchParams.set("f", "geojson");

const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Census TIGERweb request failed: ${response.status}`);
const collection = await response.json();
if (!Array.isArray(collection.features)) throw new Error("Census TIGERweb returned no feature collection");

const received = new Set(collection.features.map((feature) => String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? "")));
const missing = zips.filter((zip) => !received.has(zip));
if (missing.length) throw new Error(`Missing ${marketName} ZCTAs: ${missing.join(", ")}`);

collection.name = `${marketName} ZCTAs`;
collection.source = "U.S. Census Bureau TIGERweb ACS2025, 2020 Census ZIP Code Tabulation Areas";
collection.features.sort((a, b) => String(a.properties.ZCTA5).localeCompare(String(b.properties.ZCTA5)));
const centers = Object.fromEntries(collection.features.map((feature) => [String(feature.properties.ZCTA5), {
  latitude: Number(feature.properties.CENTLAT),
  longitude: Number(feature.properties.CENTLON),
}]));

await fs.writeFile(new URL(`../public/data/${slug}-zcta.geojson`, import.meta.url), `${JSON.stringify(collection)}\n`);
await fs.writeFile(new URL(`../src/data/market-iq/${slug}-zcta-centers.json`, import.meta.url), `${JSON.stringify(centers, null, 2)}\n`);
console.log(`Wrote ${collection.features.length} ${marketName} ZCTAs and centers.`);
