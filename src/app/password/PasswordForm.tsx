"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client form for the research-preview gate. Plain useState — no
// react-hook-form because there's a single field and no schema validation
// to share with a backend Zod parser (validation is "string matches
// AUTH_PASSWORD," which the server already does).
//
// On submit:
//   - POST { password } to /api/password
//   - 200 → server has set the dq_auth cookie; router.replace(from || "/")
//     forces a full server re-render so middleware reads the new cookie.
//     router.replace (vs push) keeps the gate out of the browser history.
//   - 401 → render the inline error and let the visitor retry
//   - Other → generic error (network failure, server misconfiguration)
export function PasswordForm({ from }: { from: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Hard navigation so the just-set cookie is read by middleware on
        // the next request. router.refresh() alone would not pick up the
        // cookie change reliably across browsers.
        window.location.assign(from || "/");
        return;
      }
      if (res.status === 401) {
        setError("Incorrect access code. Try again.");
      } else {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error ?? "Something went wrong. Try again in a moment.");
      }
    } catch {
      setError("Network error. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-3">
      <label className="block">
        <span className="dq-eyebrow-muted mb-1.5 block text-[11px] tracking-[0.14em]">
          Access code
        </span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? "true" : undefined}
          className="h-11 w-full rounded-md border border-grid bg-white px-3 text-[15px] text-navy outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-navy/15 aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !password}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-navy px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Verifying…" : "Continue"}
      </button>
    </form>
  );
}
