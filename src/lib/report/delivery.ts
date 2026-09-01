// v0.30 — Post-purchase delivery for the single-report funnel. Emails the buyer
// their durable magic-link to the report + a direct PDF download. Guest buyers
// have no account, so both links carry a signed access token (see
// access-token.ts); the token asserts the paid email, and the DB entitlement
// still decides what it unlocks.
//
// Called from the Stripe webhook after the entitlement is granted. Best-effort:
// a failed send is logged + reported, never thrown into the webhook's retry
// decision (the durable grant already landed; the buyer can also reach the
// report from the Stripe success redirect).

import "server-only";
import * as Sentry from "@sentry/nextjs";
import { sendEmail } from "@/lib/email/send";
import { signReportAccessToken } from "@/lib/report/access-token";
import type { ProductKind } from "@/lib/billing/products";

/** Absolute base URL for building links from a webhook (no request origin). */
function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export interface ReportDeliveryArgs {
  email: string;
  kind: ProductKind;
  pmSlug?: string | null;
  pmName?: string | null;
  marketName?: string | null;
}

/** Send the purchase confirmation + access links. Returns whether the send
 *  succeeded (for logging); never throws. */
export async function sendReportPurchaseEmail(
  args: ReportDeliveryArgs
): Promise<boolean> {
  try {
    const base = baseUrl();
    const token = signReportAccessToken(args.email);
    const tq = token ? `?token=${encodeURIComponent(token)}` : "";

    let subject: string;
    let heading: string;
    let ctaLabel: string;
    let ctaUrl: string;
    let pdfBlock = "";

    if (args.kind === "single_report" && args.pmSlug) {
      const name = args.pmName ?? "your property manager";
      subject = `Your Dwellsy IQ Markets report on ${name}`;
      heading = `Your report on ${name} is ready`;
      ctaLabel = "View the full report";
      ctaUrl = `${base}/report/r/${args.pmSlug}${tq}`;
      const pdfUrl = `${base}/api/report/${args.pmSlug}/pdf${tq}`;
      pdfBlock = `<p style="margin:16px 0 0"><a href="${pdfUrl}">Download the PDF</a> to keep a copy.</p>`;
    } else if (args.kind === "subscription") {
      subject = "Your Dwellsy IQ Markets subscription is active";
      heading = "Your Keep Watching subscription is active";
      ctaLabel = "Manage your subscription";
      ctaUrl = `${base}/report/account${tq}`;
      pdfBlock = `<p style="margin:16px 0 0">Browse and open any manager&rsquo;s report in your market from <a href="${base}/report${tq}">here</a>.</p>`;
    } else {
      // market_pass — market-wide access for 30 days.
      const market = args.marketName ?? "your market";
      subject = `Your Dwellsy IQ Markets market access — ${market}`;
      heading = `Your market pass for ${market} is active`;
      ctaLabel = "Browse managers in your market";
      ctaUrl = `${base}/report${tq}`;
    }

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
        <h1 style="font-size:20px;color:#0f2140">${heading}</h1>
        <p style="font-size:15px;line-height:1.5">Thanks for your purchase. Your access is ready — this link is yours to revisit anytime.</p>
        <p style="margin:24px 0">
          <a href="${ctaUrl}" style="display:inline-block;background:#0f2140;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">${ctaLabel}</a>
        </p>
        ${pdfBlock}
        <p style="font-size:13px;color:#667085;margin-top:28px">Dwellsy IQ Markets measures property managers independently from observed rental-listing activity. We are not paid by the managers we rate.</p>
      </div>`;
    const text = `${heading}\n\nThanks for your purchase. Your access is ready:\n${ctaUrl}\n\nDwellsy IQ Markets · independent property-manager intelligence.`;

    const result = await sendEmail({ to: args.email, subject, html, text });
    if (!result.ok) {
      Sentry.captureMessage("Report delivery email failed", {
        level: "warning",
        tags: { component: "report-delivery", kind: args.kind },
        extra: { error: result.error },
      });
      console.error("[report-delivery] send failed:", result.error);
    }
    return result.ok;
  } catch (err) {
    Sentry.captureException(err, { tags: { component: "report-delivery" } });
    console.error("[report-delivery] unexpected error", err);
    return false;
  }
}
