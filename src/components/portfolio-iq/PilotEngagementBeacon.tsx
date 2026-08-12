"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PilotEngagementBeacon({ portfolioId }: { portfolioId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    void fetch("/api/portfolio-iq/pilot-engagement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ portfolioId, route: pathname }),
      keepalive: true,
    });
  }, [pathname, portfolioId]);
  return null;
}
