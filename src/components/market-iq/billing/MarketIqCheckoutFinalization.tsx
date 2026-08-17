"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProvisioningStatus = {
  ready: boolean;
  reason: string;
  planName?: string | null;
  nextUrl: string;
};

const MAX_ATTEMPTS = 30;

export function MarketIqCheckoutFinalization({ initialReady, initialPlanName, initialNextUrl }: { initialReady: boolean; initialPlanName: string | null; initialNextUrl: string }) {
  const [status, setStatus] = useState<"checking" | "ready" | "delayed">(initialReady ? "ready" : "checking");
  const [planName, setPlanName] = useState(initialPlanName);
  const [nextUrl, setNextUrl] = useState(initialNextUrl);

  useEffect(() => {
    if (initialReady) return;
    let attempts = 0;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      attempts += 1;
      try {
        const response = await fetch("/api/market-iq/billing/status", { cache: "no-store" });
        if (response.ok) {
          const result = await response.json() as ProvisioningStatus;
          if (result.ready && !stopped) {
            setPlanName(result.planName ?? null);
            setNextUrl(result.nextUrl);
            setStatus("ready");
            return;
          }
        }
      } catch {
        // A transient network error should not interrupt Stripe provisioning.
      }
      if (stopped) return;
      if (attempts >= MAX_ATTEMPTS) {
        setStatus("delayed");
        return;
      }
      timeout = setTimeout(check, 2_000);
    }

    void check();
    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [initialReady]);

  return <section className={`mt-8 overflow-hidden rounded-2xl border ${status === "ready" ? "border-emerald-200 bg-emerald-50" : status === "delayed" ? "border-amber-200 bg-amber-50" : "border-teal-200 bg-teal-50"}`} aria-live="polite">
    <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span aria-hidden className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${status === "ready" ? "bg-emerald-600 text-white" : "bg-white text-teal-700 shadow-sm"}`}>{status === "ready" ? "✓" : <span className="size-4 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />}</span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Purchase complete</p>
          <h2 className="mt-1 text-xl font-semibold text-navy">{status === "ready" ? `${planName ?? "Market IQ"} is ready` : status === "delayed" ? "Provisioning is taking longer than usual" : "Activating your Market IQ workspace"}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{status === "ready" ? "Your subscription and Cleveland access are confirmed. Continue to the setup designed for your plan." : status === "delayed" ? "Your payment is safe. Stripe has not finished confirming access yet, so no additional purchase is needed." : "We are confirming the subscription and attaching Cleveland to your workspace. You can leave this page open."}</p>
        </div>
      </div>
      {status === "ready" ? <Link href={nextUrl} className="shrink-0 rounded-md bg-navy px-5 py-3 text-center text-sm font-semibold text-white">Continue to setup</Link> : status === "delayed" ? <button type="button" onClick={() => window.location.reload()} className="shrink-0 rounded-md border border-navy bg-white px-5 py-3 text-sm font-semibold text-navy">Check again</button> : <p className="shrink-0 text-xs font-semibold text-teal-800">Checking securely…</p>}
    </div>
  </section>;
}
