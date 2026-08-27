"use client";

// B2B Dwellsy API Access checkout CTA. Posts to /api/stripe/checkout with the
// api_access SKU and redirects the browser to the returned Stripe Checkout
// Session (subscription mode — Stripe collects the card + billing email and
// sets up the recurring charge). No login required; Stripe is the identity +
// payment surface. Mirrors the consumer CheckoutButtons pattern.

import { useState } from "react";

export function ApiAccessCheckoutButton({
  label = "Subscribe — $250/mo",
}: {
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "api_access" }),
      });
      if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
      const data: { url?: string } = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={start}
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-navy px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Redirecting…" : label}
      </button>
      <p className="text-[12.5px] text-muted-foreground">
        Secure checkout via Stripe. You&rsquo;ll enter a card and be billed
        $250 every month until you cancel.
      </p>
      {error && (
        <p className="text-[13px] text-red-600" role="alert">
          {error}. Please try again.
        </p>
      )}
    </div>
  );
}
