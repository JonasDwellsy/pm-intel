import { NextResponse } from "next/server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { portfolioId?: unknown; route?: unknown };
  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId : "";
  const route = typeof body.route === "string" && body.route.startsWith("/") ? body.route.slice(0, 160) : "/today";
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { id: true, organizationId: true, isSynthetic: true } });
  const allowed = portfolio && (portfolio.organizationId === organizationId || (portfolio.isSynthetic && isAdminUser(userId)));
  if (!portfolio || !allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.portfolioIqPilotEngagement.upsert({
    where: { portfolioId_userId: { portfolioId, userId } },
    create: { portfolioId, organizationId: portfolio.organizationId, userId, lastRoute: route },
    update: { lastViewedAt: new Date(), viewCount: { increment: 1 }, lastRoute: route },
  });
  return NextResponse.json({ ok: true });
}
