"use client";

// PR #75 — Prospect-share polish.
//
// Copy link button rendered in the IdentityHero right rail (alongside
// the methodology badge). On click:
//
//   1. Copy `window.location.href` to clipboard via
//      navigator.clipboard.writeText().
//   2. Show an inline "Link copied" toast (matches the WatchListEditor
//      success-toast pattern: fixed bottom-center, bg-good, 3s auto-
//      dismiss).
//   3. Fire PostHog `scorecard_link_copied` with operator_slug so
//      we can see distribution behavior in analytics dashboards.
//
// Fallback: when navigator.clipboard is unavailable (older browser,
// http:// preview, iframe contexts that block the API), surface a
// small modal showing the URL with a Select-all-on-focus input so
// the viewer can copy manually. Sentry-instrument the fallback so
// we know if the API is failing for real users.
//
// The component is client-only because clipboard APIs require it.
// The surrounding IdentityHero stays a server component; we just
// drop this island into the right rail.

import React from "react";
import * as Sentry from "@sentry/nextjs";
import { capture } from "@/lib/analytics";

export function CopyLinkButton({ operatorSlug }: { operatorSlug: string }) {
  const [toast, setToast] = React.useState<{
    kind: "success" | "error";
    msg: string;
  } | null>(null);
  /** Set when the clipboard API is unavailable or throws — render a
   *  small modal with a manual-select input as the fallback path. */
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);
  const fallbackInputRef = React.useRef<HTMLInputElement>(null);

  function showToast(kind: "success" | "error", msg: string) {
    setToast({ kind, msg });
    // Matches WatchListEditor's 3000ms auto-dismiss for consistency.
    window.setTimeout(() => setToast(null), 3000);
  }

  async function handleCopy() {
    const url =
      typeof window !== "undefined" ? window.location.href : "";

    // Fire the analytics event regardless of clipboard success — the
    // intent signal matters more than the technical outcome, and we
    // surface the operator_slug so PostHog can rank which scorecards
    // are getting shared.
    capture("scorecard_link_copied", { operator_slug: operatorSlug });

    // Feature-detect: navigator.clipboard is undefined on http:// in
    // some browsers, on older Safari, and in some iframe contexts.
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setFallbackUrl(url);
      Sentry.captureMessage(
        "[scorecard] CopyLinkButton: clipboard API unavailable, fell back to manual-select modal",
        { level: "warning", tags: { component: "CopyLinkButton" } }
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast("success", "Link copied");
    } catch (err) {
      // Clipboard write was blocked at runtime — same fallback path.
      setFallbackUrl(url);
      Sentry.captureException(err, {
        tags: { component: "CopyLinkButton" },
        extra: {
          message:
            "navigator.clipboard.writeText rejected; fell back to manual-select modal",
        },
      });
    }
  }

  // Auto-select the URL inside the fallback modal so the user just
  // hits Cmd+C / Ctrl+C — turns a 3-tap UX into a 2-tap UX.
  React.useEffect(() => {
    if (fallbackUrl && fallbackInputRef.current) {
      fallbackInputRef.current.focus();
      fallbackInputRef.current.select();
    }
  }, [fallbackUrl]);

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-3 py-1 text-[11.5px] font-semibold text-navy transition-colors hover:border-navy hover:bg-surface-soft focus-visible:border-navy focus-visible:bg-surface-soft focus-visible:outline-none"
        aria-label="Copy scorecard link to clipboard"
      >
        <LinkIcon />
        Copy link
      </button>

      {/* Toast — success / error variants, fixed bottom-center,
          matches WatchListEditor's pattern verbatim so the toast
          surface feels consistent across the app. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={
            "fixed bottom-[80px] left-1/2 z-30 -translate-x-1/2 rounded-md px-4 py-2 text-[13px] font-medium text-white shadow-lg " +
            (toast.kind === "success" ? "bg-good" : "bg-bad")
          }
        >
          <span className="inline-flex items-center gap-1.5">
            {toast.kind === "success" ? <CheckIcon /> : null}
            {toast.msg}
          </span>
        </div>
      )}

      {/* Fallback modal — only renders when the clipboard API isn't
          available. Auto-selects the URL on open so the user can hit
          Cmd+C / Ctrl+C immediately. Dismisses on backdrop click or
          Escape. */}
      {fallbackUrl && (
        <FallbackModal
          url={fallbackUrl}
          inputRef={fallbackInputRef}
          onClose={() => setFallbackUrl(null)}
        />
      )}
    </>
  );
}

function FallbackModal({
  url,
  inputRef,
  onClose,
}: {
  url: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-link-fallback-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-md border border-grid bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="copy-link-fallback-title"
          className="text-[15px] font-semibold text-navy"
        >
          Copy this link
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Your browser blocked automatic copy. Select all and press
          Cmd+C (Mac) or Ctrl+C (Windows).
        </p>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-3 w-full rounded-md border border-grid bg-surface-soft px-3 py-2 text-[12.5px] font-medium text-navy focus:border-navy focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-grid bg-white px-3 py-1.5 text-[12px] font-semibold text-navy hover:bg-surface-soft"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l5 5 9-10" />
    </svg>
  );
}
