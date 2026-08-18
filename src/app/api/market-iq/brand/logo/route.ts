import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export async function POST(request: Request) {
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!marketIqPreviewEnabled() || !userId || !organizationId || !access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) return NextResponse.json({ error: "Logo upload is unavailable." }, { status: 403 });
  const token = process.env.MARKET_IQ_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Logo storage has not been connected yet." }, { status: 503 });
  const file = (await request.formData()).get("logo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a logo file." }, { status: 400 });
  if (file.size > 2_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPEG, or WebP logo smaller than 2 MB." }, { status: 400 });
  const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const blob = await put(`market-iq/${organizationId}/logos/${safeName}`, file, { access: "public", addRandomSuffix: true, contentType: file.type, token });
  return NextResponse.json({ url: blob.url });
}
