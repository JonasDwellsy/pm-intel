"use server";

// Admin "Digests" tab — send a preview of the watch-list change-alert digest
// to the signed-in admin's own email. Wraps the same runDigest({previewEmail})
// path the cron route exposes via ?preview=, so admins can eyeball rendering +
// inbox deliverability without wrangling the (Sensitive, non-retrievable)
// CRON_SECRET. Preview mode bypasses all gating + bookkeeping and never emails
// real recipients — it renders the first org that has changes and sends only to
// the given address.
//
// Auth: re-checks isAdminUser (server actions are directly callable).

import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { runDigest } from "@/lib/watch-list/digest-run";

export interface PreviewResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

export async function sendDigestPreview(
  _prev: PreviewResult | null,
  _formData: FormData
): Promise<PreviewResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const user = await currentUser();
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;
  if (!email) return { ok: false, error: "Your account has no email address on file." };

  try {
    const summary = await runDigest({ mode: "send", previewEmail: email });
    if (summary.sent > 0) {
      return {
        ok: true,
        summary: `Preview digest sent to ${email}. Check your inbox — and your spam folder, since that's the real deliverability test.`,
      };
    }
    if (summary.failed > 0) {
      return {
        ok: false,
        error:
          "SendGrid rejected the message. Check DIGEST_FROM_EMAIL and that its sending domain is verified in SendGrid.",
      };
    }
    // recipients 0 / skipped "preview: no org had changes"
    return {
      ok: true,
      summary:
        "No content to preview right now — no watch-list org has operator changes between the two most recent snapshots. Try again after the next data update.",
    };
  } catch (err) {
    console.error("[admin/digests] preview failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Preview failed." };
  }
}
