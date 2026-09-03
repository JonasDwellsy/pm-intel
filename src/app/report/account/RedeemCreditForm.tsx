"use client";

// v0.33 — Spend a credit from the wallet. Deliberately plain: the buyer types
// or pastes an operator slug they found via search. A richer picker belongs
// with the search UI, not here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildReportQuery } from "@/lib/report/query";

const REASONS: Record<string, string> = {
  no_credits: "You have no reports left to use.",
  already_owned: "You already have that report.",
  not_found: "We couldn't find that operator.",
  unidentified: "Open this page from your emailed link to use a report.",
  bad_request: "Please enter an operator.",
};

export function RedeemCreditForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmSlug: slug.trim(), token: token ?? undefined }),
      });
      const data: { ok: boolean; reason?: string; pmSlug?: string } = await res.json();
      if (data.ok) {
        // Redirect target comes from the server-echoed pmSlug, not the
        // client's typed input — they should match, but the server's value
        // is the one actually redeemed. The token carries forward too: a
        // guest has no session, so a redirect without it would drop them
        // right back on the teaser for the report they just spent a credit
        // on.
        router.push(`/report/r/${data.pmSlug ?? slug.trim()}${buildReportQuery({ token })}`);
        return;
      }
      setError(REASONS[data.reason ?? ""] ?? "That didn't work. Please try again.");
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="operator-name-city-st"
        aria-label="Operator to use a report on"
        className="h-11 flex-1 rounded-md border border-navy/20 px-3 text-[14px]"
      />
      <button
        type="submit"
        disabled={busy || slug.trim().length === 0}
        className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 text-[14px] font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Opening…" : "Use a report"}
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-red-600 sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
