"use client";

// Re-Run button on the results page. Triggers a router.refresh()
// so the server component re-executes apply() — same dataset, but
// the apply() result includes generatedAt and may pick up freshly-
// seeded operators. The button stays in the page header alongside
// Edit Buy Box and the methodology disclosure.

import * as React from "react";
import { useRouter } from "next/navigation";

export function ReRunButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setPending(true);
        router.refresh();
        // The router.refresh() promise isn't surfaced, so clear the
        // spinner after a short tick — re-runs are fast (single
        // DB pass + in-memory eval).
        window.setTimeout(() => setPending(false), 400);
      }}
      disabled={pending}
      className="h-9 inline-flex items-center rounded-md border border-grid bg-white px-3.5 text-[13px] font-medium text-navy hover:bg-surface-soft disabled:opacity-50"
    >
      {pending ? "Re-running…" : "Re-Run"}
    </button>
  );
}
