"use server";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { sendEmail } from "@/lib/email/send";
import { loadOwnerBriefing } from "@/lib/portfolio-iq/owner-briefing.server";
import { buildOwnerBriefingEmail } from "@/lib/portfolio-iq/owner-briefing";

export async function sendOwnerBriefingPreview(): Promise<void> {
  const [{ userId, organizationId }, user] = await Promise.all([getActiveOrgContext(), currentUser()]);
  if (!userId || !organizationId || !user) throw new Error("Workspace not ready.");
  const briefing = await loadOwnerBriefing({ userId, organizationId });
  if (!briefing) throw new Error("Owner briefing not found.");
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error("Your account has no email address.");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com";
  const message = buildOwnerBriefingEmail({ snapshot: briefing.snapshot, recipientName: user.firstName, reportUrl: `${baseUrl}/portfolio-iq/reports`, preview: true });
  const result = await sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text });
  redirect(`/portfolio-iq/reports?email=${result.ok ? "sent" : "failed"}`);
}
