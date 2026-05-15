"use client";

import { useEffect, useRef } from "react";
import { capture, type EventName, type EventProps } from "@/lib/analytics";

// Fires a single capture on mount. Re-fires only if the event name changes
// (mounting in a new route resets the ref via remount).
export function TrackEvent({
  event,
  properties,
}: {
  event: EventName;
  properties?: EventProps;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    capture(event, properties ?? {});
  }, [event, properties]);
  return null;
}
