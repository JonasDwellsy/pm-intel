"use client";

// Client button for the admin Digests tab: sends a preview of the watch-list
// change-alert digest to the signed-in admin's own email via sendDigestPreview.

import { useActionState } from "react";
import { sendDigestPreview, type PreviewResult } from "./actions";

export function DigestPreviewPanel() {
  const [state, action, pending] = useActionState<PreviewResult | null, FormData>(
    sendDigestPreview,
    null
  );
  return (
    <div className="space-y-3">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md bg-navy px-4 py-2 text-[14px] font-semibold text-white hover:bg-navy/90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send me a preview digest"}
        </button>
      </form>
      {state?.ok && state.summary ? (
        <p className="text-[13px] text-green-700">{state.summary}</p>
      ) : null}
      {state && !state.ok && state.error ? (
        <p className="text-[13px] text-red-700">{state.error}</p>
      ) : null}
    </div>
  );
}
