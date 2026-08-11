import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";

export async function loadPortfolioOnboarding(input: { organizationId: string; userId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  const targetOrganizationId = portfolio?.organizationId ?? input.organizationId;
  const request = await prisma.portfolioIqOnboardingRequest.findUnique({
    where: { organizationId: targetOrganizationId },
    include: { properties: { orderBy: { createdAt: "asc" } } },
  });
  return { portfolio, request, targetOrganizationId };
}
