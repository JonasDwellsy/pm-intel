import { NextResponse } from "next/server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { suggestWebsitePalette } from "@/lib/market-iq/brand/website.server";

export async function POST(request: Request) {
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const body = await request.json() as { website?: string };
    if (!body.website) throw new Error("Enter your website first.");
    return NextResponse.json(await suggestWebsitePalette(body.website));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not suggest colors from that website." }, { status: 400 });
  }
}
