import test from "node:test";
import { strict as assert } from "node:assert";
import { fetchCoverageMapImage } from "./pdf-coverage-map";

const GEO = {
  citiesText: "Philadelphia",
  coverageMapPoints: [
    { lat: 40.0, lon: -75.0, n: 5 },
    { lat: 40.02, lon: -74.98, n: 40 },
  ],
  msaBackdropPoints: [
    { lat: 40.0, lon: -75.0 },
    { lat: 40.05, lon: -75.05 },
  ],
  mapBounds: { north: 40.1, south: 39.9, east: -74.9, west: -75.1 },
} as unknown as import("@/lib/types").ScorecardData["geographicCoverage"];

function pngResponse(): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer, // "\x89PNG"
  } as unknown as Response;
}

test("success: returns data URL + projected in-box pixels", async () => {
  let calledUrl = "";
  const fetchImpl = (async (url: string) => {
    calledUrl = url;
    return pngResponse();
  }) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.ok(res);
  assert.ok(res!.dataUrl.startsWith("data:image/png;base64,"));
  assert.equal(res!.width, 1000);
  assert.equal(res!.coveragePx.length, 2);
  for (const p of res!.coveragePx) {
    assert.ok(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 500);
  }
  // URL must NOT contain any coordinate pairs from the points payload
  assert.ok(!calledUrl.includes("geojson"));
});

test("missing token → null (no fetch)", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return pngResponse();
  }) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: undefined,
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
  assert.equal(called, false);
});

test("no bounds → null (no fetch)", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return pngResponse();
  }) as unknown as typeof fetch;
  const emptyGeo = {
    citiesText: "",
    coverageMapPoints: [],
    msaBackdropPoints: [],
    mapBounds: undefined,
  } as unknown as import("@/lib/types").ScorecardData["geographicCoverage"];
  const res = await fetchCoverageMapImage(emptyGeo, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
  assert.equal(called, false);
});

test("HTTP error → null", async () => {
  const fetchImpl = (async () =>
    ({ ok: false, status: 500 }) as unknown as Response) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
});

test("fetch rejection / abort → null", async () => {
  const fetchImpl = (async () => {
    throw new DOMException("aborted", "AbortError");
  }) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
});
