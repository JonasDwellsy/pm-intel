"use client";

import { useEffect } from "react";
import { capture, type EventProps } from "@/lib/analytics";

// IntersectionObserver-based one-shot tracker. Fires `paywall_view` the first
// time the paywall card scrolls into the viewport.
export function PaywallViewTracker({
  targetId,
  properties,
}: {
  targetId: string;
  properties: EventProps;
}) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = document.getElementById(targetId);
    if (!el) return;
    let fired = false;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired) {
            fired = true;
            capture("paywall_view", properties);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [targetId, properties]);
  return null;
}
