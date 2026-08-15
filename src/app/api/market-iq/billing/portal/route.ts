import { redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!marketIqPreviewEnabled()) return new Response("Not found", { status: 404 });
  const { userId, organizationId, role } = await getActiveOrgContext();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!organizationId) redirect("/setup-workspace");
  if (role !== "org:admin") return new Response("Only an organization admin can manage billing.", { status: 403 });
  const subscription = await prisma.marketIqSubscription.findFirst({
    where: { organizationId, source: "stripe", stripeCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { stripeCustomerId: true },
  });
  if (!subscription?.stripeCustomerId) return new Response("No Stripe billing account was found.", { status: 404 });
  const origin = new URL(request.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${origin}/market-iq/subscribe`,
  });
  redirect(session.url);
}
