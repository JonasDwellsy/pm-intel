import fs from "node:fs/promises";

const zips = JSON.parse(await fs.readFile(new URL("../src/data/market-iq/cleveland-msa-zips.json", import.meta.url), "utf8"));
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
const expectedNonZctaZips = ["44061"];
if (missing.some((zip) => !expectedNonZctaZips.includes(zip))) {
  throw new Error(`Unexpected missing Cleveland MSA ZCTAs: ${missing.join(", ")}`);
}
if (received.size !== zips.length - expectedNonZctaZips.length) {
  throw new Error(`Expected ${zips.length - expectedNonZctaZips.length} ZCTAs, received ${received.size}`);
}

collection.name = "Cleveland-Elyria MSA ZCTAs";
collection.source = "U.S. Census Bureau TIGERweb ACS2025, 2020 Census ZIP Code Tabulation Areas";
collection.features.sort((a, b) => String(a.properties.ZCTA5).localeCompare(String(b.properties.ZCTA5)));

const centers = Object.fromEntries(collection.features.map((feature) => {
  const zip = String(feature.properties.ZCTA5);
  return [zip, {
    latitude: Number(feature.properties.CENTLAT),
    longitude: Number(feature.properties.CENTLON),
  }];
}));

await fs.writeFile(new URL("../public/data/cleveland-zcta.geojson", import.meta.url), `${JSON.stringify(collection)}\n`);
await fs.writeFile(new URL("../src/data/market-iq/cleveland-zcta-centers.json", import.meta.url), `${JSON.stringify(centers, null, 2)}\n`);
console.log(`Wrote ${collection.features.length} Cleveland-Elyria ZCTAs and centers. Postal ZIP 44061 has no Census ZCTA polygon.`);
