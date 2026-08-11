"use client";
import { useState } from "react";

export function PortfolioWatchDigestPanel() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function sendTest() {
    setSending(true); setMessage(null); setError(null);
    try {
      const response = await fetch("/api/portfolio-iq/digest/test", { method: "POST" });
      const payload = await response.json() as { recipient?: string; signalCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not send the test digest.");
      setMessage(`Owner briefing preview sent to ${payload.recipient} with ${payload.signalCount ?? 0} priority findings.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the test digest.");
    } finally { setSending(false); }
  }
  return <div>
    <button type="button" onClick={sendTest} disabled={sending} className="rounded-md border border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-50">
      {sending ? "Sending..." : "Email owner briefing preview"}
    </button>
    {message && <p role="status" className="mt-3 text-xs font-medium text-good">{message}</p>}
    {error && <p role="alert" className="mt-3 text-xs font-medium text-bad">{error}</p>}
  </div>;
}
