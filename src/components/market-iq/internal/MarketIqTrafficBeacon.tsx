"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Records one coarse, authenticated Market IQ page view per route change.
 * The endpoint deliberately accepts only an allowlisted route family. Query
 * strings, report content, recipient details, and public report visits are
 * never sent.
 */
export function MarketIqTrafficBeacon() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    void fetch("/api/market-iq/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname }),
      keepalive: true,
    });
  }, [pathname]);

  return null;
}
