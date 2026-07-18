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
  // The coverage/backdrop POINTS must never be serialized into the request
  // URL — only the map center+zoom+size may appear. These fragments are
  // distinctive to the points (not the bbox-midpoint center or the size).
  for (const frag of ["-74.98", "40.02", "-75.05", "40.05"]) {
    assert.ok(!calledUrl.includes(frag), `point coord ${frag} leaked into URL`);
  }
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

test("onFailure telemetry hook reports each failure reason", async () => {
  const calls: Array<{ reason: string; status?: number }> = [];
  const onFailure = (f: { reason: string; status?: number }) => calls.push(f);
  const opts = { width: 1000, height: 500, timeoutMs: 2500, onFailure };

  // 403 → { reason: "http", status: 403 } (the actionable token-misconfig case)
  const http403 = (async () =>
    ({ ok: false, status: 403 }) as unknown as Response) as unknown as typeof fetch;
  await fetchCoverageMapImage(GEO, { ...opts, token: "TESTTOKEN", fetchImpl: http403 });
  assert.deepEqual(calls.at(-1), { reason: "http", status: 403 });

  // missing token → { reason: "no_token" } (before any fetch)
  await fetchCoverageMapImage(GEO, { ...opts, token: undefined, fetchImpl: http403 });
  assert.deepEqual(calls.at(-1), { reason: "no_token" });

  // abort → { reason: "aborted" }
  const abortImpl = (async () => {
    throw new DOMException("aborted", "AbortError");
  }) as unknown as typeof fetch;
  await fetchCoverageMapImage(GEO, { ...opts, token: "TESTTOKEN", fetchImpl: abortImpl });
  assert.deepEqual(calls.at(-1), { reason: "aborted" });
});

test("onFailure is NOT called on success", async () => {
  let failures = 0;
  const fetchImpl = (async () => pngResponse()) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
    onFailure: () => {
      failures += 1;
    },
  });
  assert.ok(res);
  assert.equal(failures, 0);
});

test("a throwing onFailure never breaks the caller (still returns null)", async () => {
  const http403 = (async () =>
    ({ ok: false, status: 403 }) as unknown as Response) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl: http403,
    onFailure: () => {
      throw new Error("telemetry boom");
    },
  });
  assert.equal(res, null);
});
