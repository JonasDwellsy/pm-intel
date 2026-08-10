"use client";

import { useState } from "react";

export function MarketIqDigestPanel() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendTest() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/market-iq/digest/test", { method: "POST" });
      const payload = await response.json() as { recipient?: string; alertCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not send the test digest.");
      setMessage(`Test digest sent to ${payload.recipient} with ${payload.alertCount ?? 0} matched alerts.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the test digest.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="digest-heading" className="mt-10 rounded-lg border border-teal/25 bg-teal-soft p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <p className="dq-eyebrow">Narrative delivery</p>
          <h2 id="digest-heading" className="dq-h2">Preview your weekly Market IQ email</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This internal-preview control sends only to your signed-in Clerk email. It does not contact clients or change Operator IQ email delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={sendTest}
          disabled={sending}
          className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send test digest"}
        </button>
      </div>
      {message && <p role="status" className="mt-4 rounded-md bg-white p-3 text-sm font-medium text-good">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-md bg-white p-3 text-sm font-medium text-bad">{error}</p>}
    </section>
  );
}
