"use server";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { deliverOwnerBriefingPreview } from "@/lib/portfolio-iq/owner-briefing-delivery.server";

export async function sendOwnerBriefingPreview(): Promise<void> {
  const [{ userId, organizationId }, user] = await Promise.all([getActiveOrgContext(), currentUser()]);
  if (!userId || !organizationId || !user) throw new Error("Workspace not ready.");
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("Your account has no email address.");
  const result = await deliverOwnerBriefingPreview({
    userId,
    organizationId,
    email,
    recipientName: user.firstName,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com",
  });
  redirect(`/portfolio-iq/reports?email=${result.ok ? "sent" : "failed"}`);
}
