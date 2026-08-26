"use client";

// v0.32 — Opens the Stripe Billing Portal for the current subscriber (manage
// payment, view invoices, cancel). Posts to /api/report/portal and redirects
// to the returned portal URL.

import { useState } from "react";

export function ManageSubscriptionButton({
  token,
  partner,
}: {
  token?: string | null;
  partner?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/report/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token ?? undefined, partner: partner ?? undefined }),
      });
      if (!res.ok) throw new Error(`Couldn't open billing (${res.status})`);
      const data: { url?: string } = await res.json();
      if (!data.url) throw new Error("No portal URL returned");
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
        onClick={open}
        style={{
          backgroundColor: "var(--report-accent, #0f2140)",
          color: "var(--report-accent-fg, #ffffff)",
        }}
        className="inline-flex h-11 w-fit items-center justify-center rounded-md px-6 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Opening…" : "Manage subscription"}
      </button>
      {error && (
        <p className="text-[13px] text-red-600" role="alert">
          {error}. Please try again.
        </p>
      )}
    </div>
  );
}
