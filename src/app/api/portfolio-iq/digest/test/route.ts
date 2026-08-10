import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { refreshPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { buildPortfolioIqDigest } from "@/lib/portfolio-iq/digest";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return Response.json({ error: "Not found." }, { status: 404 });
  const [{ organizationId }, user] = await Promise.all([getActiveOrgContext(), currentUser()]);
  if (!organizationId) return Response.json({ error: "Workspace not ready." }, { status: 503 });
  const portfolio = await loadPortfolioIqHome({ userId, organizationId });
  if (!portfolio) return Response.json({ error: "Portfolio not found." }, { status: 404 });
  const email = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) return Response.json({ error: "Your Clerk account has no email address." }, { status: 422 });
  const signals = await refreshPortfolioWatchSignals(portfolio.id);
  const digest = buildPortfolioIqDigest({ portfolioName: portfolio.name, recipientName: user?.firstName ?? null, dashboardUrl: `${new URL(request.url).origin}/portfolio-iq`, signals, preview: true });
  const sent = await sendEmail({ to: email, subject: digest.subject, html: digest.html, text: digest.text });
  if (!sent.ok) return Response.json({ error: sent.error }, { status: 502 });
  return Response.json({ sent: true, recipient: email, signalCount: digest.signalCount, messageId: sent.id });
}
