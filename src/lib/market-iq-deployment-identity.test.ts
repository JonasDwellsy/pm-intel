import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GET } from "@/app/api/market-iq-deployment-identity/route";

const IDENTITY_KEYS = [
  "VERCEL_ENV",
  "MARKET_IQ_PREVIEW_ENABLED",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_URL",
  "MARKET_IQ_BUILD_TIMESTAMP",
] as const;

async function withEnvironment(
  values: Partial<Record<(typeof IDENTITY_KEYS)[number], string | undefined>>,
  run: () => Promise<void>,
) {
  const prior = Object.fromEntries(IDENTITY_KEYS.map((key) => [key, process.env[key]]));
  for (const key of IDENTITY_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const key of IDENTITY_KEYS) {
      const value = prior[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const validIdentity = {
  VERCEL_ENV: "preview",
  MARKET_IQ_PREVIEW_ENABLED: "1",
  VERCEL_PROJECT_PRODUCTION_URL: "market-iq-mu.vercel.app",
  VERCEL_GIT_COMMIT_REF: "codex/market-iq-integration",
  VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
  VERCEL_URL: "market-current.vercel.app",
  MARKET_IQ_BUILD_TIMESTAMP: "2026-08-21T12:00:00.000Z",
} as const;

test("deployment identity is available only from the isolated Market IQ preview", async () => {
  await withEnvironment(validIdentity, async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      product: "market-iq",
      environment: "preview",
      branch: "codex/market-iq-integration",
      commit: "0123456789abcdef0123456789abcdef01234567",
      deploymentUrl: "market-current.vercel.app",
      builtAt: "2026-08-21T12:00:00.000Z",
    });
  });

  await withEnvironment({ ...validIdentity, VERCEL_ENV: "production" }, async () => {
    assert.equal((await GET()).status, 404);
  });
  await withEnvironment({ ...validIdentity, MARKET_IQ_PREVIEW_ENABLED: undefined }, async () => {
    assert.equal((await GET()).status, 404);
  });
  await withEnvironment({ ...validIdentity, VERCEL_PROJECT_PRODUCTION_URL: "intel.iq.dwellsy.com" }, async () => {
    assert.equal((await GET()).status, 404);
  });
});

test("deployment identity fails closed when Vercel metadata is incomplete", async () => {
  await withEnvironment({ ...validIdentity, VERCEL_GIT_COMMIT_SHA: undefined }, async () => {
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Deployment identity is incomplete" });
  });
});

test("readiness and CI expose and verify the same deployment identity", () => {
  const readiness = readFileSync("src/app/market-iq/internal/readiness/page.tsx", "utf8");
  const workflow = readFileSync(".github/workflows/market-iq-stable-preview.yml", "utf8");
  const config = readFileSync("next.config.ts", "utf8");

  assert.match(readiness, /Deployment identity/);
  assert.match(readiness, /VERCEL_GIT_COMMIT_REF/);
  assert.match(readiness, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(readiness, /MARKET_IQ_BUILD_TIMESTAMP/);
  assert.match(config, /MARKET_IQ_BUILD_TIMESTAMP: new Date\(\)\.toISOString\(\)/);

  assert.match(workflow, /codex\/market-iq-integration/);
  assert.match(workflow, /market-preview\.intel\.iq\.dwellsy\.com/);
  assert.match(workflow, /x-vercel-protection-bypass/);
  assert.match(workflow, /github\.sha/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
