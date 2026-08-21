export const dynamic = "force-dynamic";

const EXPECTED_MARKET_IQ_PROJECT = "market-iq-mu.vercel.app";

function isIsolatedMarketIqPreview() {
  return process.env.VERCEL_ENV === "preview"
    && process.env.MARKET_IQ_PREVIEW_ENABLED === "1"
    && process.env.VERCEL_PROJECT_PRODUCTION_URL === EXPECTED_MARKET_IQ_PROJECT;
}

export async function GET() {
  if (!isIsolatedMarketIqPreview()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const deploymentUrl = process.env.VERCEL_URL?.trim();
  const builtAt = process.env.MARKET_IQ_BUILD_TIMESTAMP?.trim();
  if (!branch || !commit || !deploymentUrl || !builtAt) {
    return Response.json(
      { error: "Deployment identity is incomplete" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      product: "market-iq",
      environment: process.env.VERCEL_ENV,
      branch,
      commit,
      deploymentUrl,
      builtAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
