import "server-only";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { prisma } from "@/lib/prisma";

export async function loadPortfolioIqCollaboration(input: { organizationId: string; userId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;
  const [briefs, signals] = await Promise.all([
    prisma.portfolioIqPmBrief.findMany({
      where: { portfolioId: portfolio.id },
      include: {
        asset: { select: { slug: true, name: true, observedOperatorName: true } },
        signal: { select: { id: true, headline: true, severity: true, category: true, decision: true } },
        response: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
    prisma.portfolioIqSignal.findMany({
      where: { portfolioId: portfolio.id, status: "active", assetId: { not: null } },
      include: { asset: { select: { slug: true, name: true, observedOperatorName: true } }, pmBriefs: { where: { status: { not: "revoked" } }, select: { id: true } } },
      orderBy: [{ rankScore: "desc" }, { observedAt: "desc" }],
    }),
  ]);
  const now = new Date();
  const drafts = signals.filter((signal) => signal.pmBriefs.length === 0);
  const awaitingResponse = briefs.filter((brief) => brief.status === "published" && (!brief.response || brief.response.ownerDisposition === "revised"));
  const overdue = awaitingResponse.filter((brief) => brief.responseDueAt && brief.responseDueAt < now);
  const awaitingOwnerReview = briefs.filter((brief) => brief.response?.ownerDisposition === "pending");
  const acceptedPlans = briefs.filter((brief) => brief.response?.ownerDisposition === "accepted" && brief.signal.decision?.state !== "resolved");
  const closed = briefs.filter((brief) => brief.status === "closed" || brief.response?.ownerDisposition === "closed");
  return { portfolio, briefs, drafts, awaitingResponse, overdue, awaitingOwnerReview, acceptedPlans, closed, now };
}
