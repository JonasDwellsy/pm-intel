import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES, MARKET_IQ_SINGLE_MARKET_PLAN } from "@/lib/market-iq/billing/plans";
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
  if (role !== "org:admin") return new Response("Only an organization admin can purchase Market IQ.", { status: 403 });

  const active = await prisma.marketIqSubscription.findFirst({
    where: { organizationId, status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] } },
    select: { id: true },
  });
  if (active) redirect("/market-iq/subscribe?state=active");

  const priceId = process.env.STRIPE_MARKET_IQ_SINGLE_MARKET_PRICE_ID;
  if (!priceId) return new Response("Market IQ checkout is not configured.", { status: 503 });
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, marketIqSubscriptions: { where: { stripeCustomerId: { not: null } }, orderBy: { createdAt: "desc" }, take: 1, select: { stripeCustomerId: true } } },
  });
  if (!organization) return new Response("Workspace not found.", { status: 404 });

  const stripe = getStripe();
  let customerId = organization.marketIqSubscriptions[0]?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      metadata: { dwellsy_organization_id: organizationId },
    });
    customerId = customer.id;
  }
  const origin = new URL(request.url).origin;
  const metadata = {
    dwellsy_organization_id: organizationId,
    dwellsy_market_id: CLEVELAND_MARKET_ID,
    dwellsy_plan_key: MARKET_IQ_SINGLE_MARKET_PLAN.key,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: organizationId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/market-iq/subscribe?checkout=success`,
    cancel_url: `${origin}/market-iq/subscribe?checkout=canceled`,
    metadata,
    subscription_data: { metadata },
  });
  if (!session.url) return new Response("Stripe did not return a checkout URL.", { status: 502 });
  redirect(session.url);
}
