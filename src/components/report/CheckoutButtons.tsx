"use client";

// v0.30 — Consumer checkout CTAs. Posts to /api/stripe/checkout and redirects
// the browser to the returned Stripe Checkout Session. Guest-friendly: no login
// required; Stripe collects the email. Renders one button per SKU passed in.

import { useState } from "react";
import type { ProductKind } from "@/lib/billing/products";

interface CheckoutButtonsProps {
  /** Operator being bought. Optional: a pack can be bought with no operator
   *  in context, and its credits redeemed later from the account wallet. */
  pmSlug?: string;
  /** Attribution channel, e.g. "biggerpockets". */
  partner?: string | null;
  /** SKUs to offer, in display order. First is styled as primary. */
  offers: Array<{ kind: ProductKind; label: string; priceLabel: string; sub?: string }>;
}

export function CheckoutButtons({
  pmSlug,
  partner,
  offers,
}: CheckoutButtonsProps) {
  const [pending, setPending] = useState<ProductKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(kind: ProductKind) {
    setError(null);
    setPending(kind);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, pmSlug, partner: partner ?? undefined }),
      });
      if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
      const data: { url?: string } = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {offers.map((offer, i) => {
        const primary = i === 0;
        const busy = pending === offer.kind;
        return (
          <button
            key={offer.kind}
            type="button"
            disabled={pending !== null}
            onClick={() => start(offer.kind)}
            // Primary CTA takes the partner accent (set by ReportShell as
            // --report-accent); falls back to navy off the funnel.
            style={
              primary
                ? {
                    backgroundColor: "var(--report-accent, #0f2140)",
                    color: "var(--report-accent-fg, #ffffff)",
                  }
                : undefined
            }
            className={
              primary
                ? "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-6 text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                : "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-navy bg-white px-6 text-[14px] font-semibold text-navy transition-colors hover:bg-navy-soft disabled:opacity-60"
            }
          >
            {busy ? "Redirecting…" : (
              <>
                <span>{offer.label}</span>
                <span className={primary ? "opacity-80" : "text-navy/70"}>
                  {offer.priceLabel}
                </span>
              </>
            )}
          </button>
        );
      })}
      {offers.some((o) => o.sub) && (
        <ul className="mt-1 space-y-1 text-[12.5px] leading-snug text-muted-foreground">
          {offers.map((o) =>
            o.sub ? (
              <li key={o.kind}>
                <span className="font-medium text-foreground/80">{o.label}:</span> {o.sub}
              </li>
            ) : null
          )}
        </ul>
      )}
      {error && (
        <p className="text-[13px] text-red-600" role="alert">
          {error}. Please try again.
        </p>
      )}
    </div>
  );
}
