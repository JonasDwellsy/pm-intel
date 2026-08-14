"use client";

import { useState } from "react";

export function CopyMarketReportLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }
  return <button type="button" onClick={copy} className="rounded-md border border-navy bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">{copied ? "Link copied" : "Copy client link"}</button>;
}
