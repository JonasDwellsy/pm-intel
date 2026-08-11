import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { deliverOwnerBriefingPreview } from "@/lib/portfolio-iq/owner-briefing-delivery.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return Response.json({ error: "Not found." }, { status: 404 });
  const [{ organizationId }, user] = await Promise.all([getActiveOrgContext(), currentUser()]);
  if (!organizationId || !user) return Response.json({ error: "Workspace not ready." }, { status: 503 });
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) return Response.json({ error: "Your Clerk account has no email address." }, { status: 422 });
  const result = await deliverOwnerBriefingPreview({ userId, organizationId, email, recipientName: user.firstName, baseUrl: new URL(request.url).origin });
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ sent: true, recipient: result.recipient, signalCount: result.signalCount, messageId: result.id, deliveryId: result.deliveryId });
}
