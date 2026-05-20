"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLAIM_ROLE_LABELS,
  CLAIM_ROLES,
  type ClaimRole,
} from "@/lib/lead-schema";

// v0.6.3 quick-wins — scorecard ClaimTrigger + ClaimModal.
// Inline button placed in the IdentityHero badge row. Opens a modal with
// the spec's 4-field form (name + email + role + message) and POSTs to
// the existing /api/claims endpoint. The richer payload (role + message)
// is logged but not persisted yet — see api/claims/route.ts for the
// TODO + v0.7 follow-up.
//
// Deliberately styled muted: the scorecard's primary content is the
// methodology + numbers, not the claim CTA. Operators reading their own
// page will spot it; everyone else's eye flows past.

const MAX_MESSAGE_LENGTH = 500;

export function ClaimTrigger({
  pmSlug,
  pmName,
}: {
  pmSlug: string;
  pmName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // dq-no-print: interactive affordance, doesn't belong on the
        // printed scorecard. The PM's claim status is already
        // surfaced via the Verified pill when claimed; the trigger
        // is meaningful only on the live page.
        className="dq-no-print inline-flex h-[26px] items-center gap-1.5 rounded-full border border-grid bg-white px-3 text-[11.5px] font-semibold text-navy transition-colors hover:border-navy hover:bg-surface-soft focus-visible:border-navy focus-visible:bg-surface-soft focus-visible:outline-none"
        aria-label={`Claim ${pmName}`}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 2 4 6v6c0 5 3.5 9.7 8 10 4.5-.3 8-5 8-10V6l-8-4z" />
        </svg>
        Claim this operator
      </button>
      {open && (
        <ClaimModal
          pmSlug={pmSlug}
          pmName={pmName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type FormState =
  | { kind: "idle"; error?: string }
  | { kind: "submitting" }
  | { kind: "submitted"; email: string };

function ClaimModal({
  pmSlug,
  pmName,
  onClose,
}: {
  pmSlug: string;
  pmName: string;
  onClose: () => void;
}) {
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState<ClaimRole | "">("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the first input + ESC to close. Same pattern the Cmd+K
  // SearchModal uses.
  useEffect(() => {
    const id = setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // Client-side validation — name + email required; email format check.
      const trimmedName = contactName.trim();
      const trimmedEmail = contactEmail.trim();
      if (trimmedName.length < 2) {
        setState({ kind: "idle", error: "Please enter your name." });
        return;
      }
      // Permissive email regex — leaves real validation to the server's
      // zod schema. This is a UX guard, not a security boundary.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setState({ kind: "idle", error: "Please enter a valid email." });
        return;
      }
      setState({ kind: "submitting" });
      try {
        const res = await fetch("/api/claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pmSlug,
            contactName: trimmedName,
            contactEmail: trimmedEmail,
            // Optional fields — server logs them but doesn't persist (no
            // Claim schema migration in this PR).
            contactRole: contactRole === "" ? undefined : contactRole,
            message: message.trim() === "" ? undefined : message.trim(),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState({
            kind: "idle",
            error:
              body.error ??
              "Submission failed. Please try again or email claims@dwellsy.com.",
          });
          return;
        }
        setState({ kind: "submitted", email: trimmedEmail });
      } catch {
        setState({
          kind: "idle",
          error: "Network error. Please try again.",
        });
      }
    },
    [contactEmail, contactName, contactRole, message, pmSlug]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-lg border border-grid bg-white shadow-[0_24px_64px_-24px_rgb(15_31_63_/_0.45),_0_4px_12px_rgb(15_31_63_/_0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {state.kind === "submitted" ? (
          <div className="p-7">
            <h2
              id="claim-modal-title"
              className="text-[20px] font-semibold text-navy"
            >
              Thanks for reaching out
            </h2>
            <p className="mt-3 text-[14px] leading-[1.55] text-foreground/85">
              We&rsquo;ll be in touch within 2 business days at{" "}
              <span className="font-medium text-navy">{state.email}</span>.
            </p>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              For now this is an intent-capture step — the full claim flow
              (domain verification, portfolio attestation, response editing)
              ships in a later release.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-navy px-4 text-[13px] font-semibold text-white transition-colors hover:bg-navy-700"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div className="border-b border-grid px-6 py-4">
              <h2
                id="claim-modal-title"
                className="text-[18px] font-semibold leading-tight text-navy"
              >
                Claim {pmName}
              </h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                If you run this operator, leave your details and
                we&rsquo;ll be in touch.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <Field label="Your name" required>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="h-9 w-full rounded-md border border-grid bg-white px-3 text-[14px] text-navy placeholder:text-muted-2 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                  placeholder="Full name"
                />
              </Field>
              <Field label="Email" required>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="h-9 w-full rounded-md border border-grid bg-white px-3 text-[14px] text-navy placeholder:text-muted-2 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                  placeholder="you@company.com"
                />
              </Field>
              <Field label="Your role" hint="Optional">
                <select
                  value={contactRole}
                  onChange={(e) =>
                    setContactRole(e.target.value as ClaimRole | "")
                  }
                  className="h-9 w-full rounded-md border border-grid bg-white px-3 text-[14px] text-navy focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                >
                  <option value="">Select…</option>
                  {CLAIM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {CLAIM_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Message"
                hint={`Optional · ${message.length}/${MAX_MESSAGE_LENGTH}`}
              >
                <textarea
                  value={message}
                  onChange={(e) =>
                    setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                  }
                  rows={3}
                  className="w-full resize-none rounded-md border border-grid bg-white px-3 py-2 text-[14px] leading-[1.5] text-navy placeholder:text-muted-2 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                  placeholder="Anything we should know about your claim?"
                />
              </Field>
              {state.kind === "idle" && state.error && (
                <p className="text-[13px] text-orange">{state.error}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-grid bg-surface-soft px-6 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center justify-center rounded-md border border-grid bg-white px-3.5 text-[13px] font-semibold text-navy transition-colors hover:bg-surface-soft"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={state.kind === "submitting"}
                className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-4 text-[13px] font-semibold text-white transition-colors hover:bg-navy-700 disabled:bg-navy/60"
              >
                {state.kind === "submitting" ? "Sending…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-navy">
          {label}
          {required && <span className="ml-0.5 text-orange">*</span>}
        </span>
        {hint && (
          <span className="text-[11px] text-muted-2">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}
