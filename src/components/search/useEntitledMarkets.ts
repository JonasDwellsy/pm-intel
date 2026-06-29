"use client";

// v0.22 — fetches the viewer's entitled market ids once, for client-side
// scoping of the static search index. Defaults to "all" until the fetch
// resolves so there's never a flash of empty results; a scoped org's set
// arrives a beat later and narrows the list. Anonymous visitors resolve
// to "all" (search funnels them into the login wall).

import { useEffect, useState } from "react";

export function useEntitledMarkets(): "all" | Set<string> {
  const [entitled, setEntitled] = useState<"all" | Set<string>>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/entitled-markets")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entitled?: "all" | string[] } | null) => {
        if (cancelled || !data) return;
        setEntitled(
          data.entitled === "all" || data.entitled === undefined
            ? "all"
            : new Set<string>(data.entitled)
        );
      })
      .catch(() => {
        // Network error → leave at "all". The destination scorecard /
        // operator page is entitlement-gated regardless, so an unfiltered
        // dropdown degrades to "click leads to upsell", never a data leak.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return entitled;
}
