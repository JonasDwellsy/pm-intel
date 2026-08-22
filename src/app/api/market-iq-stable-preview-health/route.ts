import { loadMarketIqStablePreviewHealth } from "@/lib/market-iq/stable-preview-health.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const health = await loadMarketIqStablePreviewHealth();
  return Response.json(health, {
    status: health.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
