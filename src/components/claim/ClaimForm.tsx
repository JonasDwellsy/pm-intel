"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { claimSchema, type ClaimInput } from "@/lib/lead-schema";
import { capture } from "@/lib/analytics";

// Two-state claim card. `form` is the default state with the name + work-email
// inputs; once POST /api/claims succeeds we swap to the success card and hold
// the submitted email in state to display in the confirmation copy.
//
// We keep both states inside this file so the page-level component stays
// server-rendered. The success card is intentionally quiet — no celebratory
// motion, no badges — matching the brand's reassurance-over-fanfare tone.

export function ClaimForm({
  pmSlug,
  pmName,
  scorecardHref,
}: {
  pmSlug: string;
  pmName: string;
  scorecardHref: string;
}) {
  const [submitState, setSubmitState] = useState<
    | { kind: "idle" }
    | { kind: "error"; message: string }
    | { kind: "submitted"; email: string }
  >({ kind: "idle" });

  const form = useForm<ClaimInput>({
    resolver: zodResolver(claimSchema),
    defaultValues: { pmSlug, contactName: "", contactEmail: "" },
  });

  const onSubmit = async (values: ClaimInput) => {
    setSubmitState({ kind: "idle" });
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitState({
          kind: "error",
          message:
            body.error ??
            "Something went wrong. Please try again or email claims@dwellsy.com.",
        });
        return;
      }
      const { claimId } = await res.json();
      capture("claim_form_submit_success", { pmSlug, claimId });
      setSubmitState({ kind: "submitted", email: values.contactEmail });
    } catch {
      setSubmitState({
        kind: "error",
        message:
          "Network error. Please try again or email claims@dwellsy.com.",
      });
    }
  };

  if (submitState.kind === "submitted") {
    return (
      <SuccessCard email={submitState.email} scorecardHref={scorecardHref} />
    );
  }

  // Shared input class — neutral border on cream-cohesive input borders, teal
  // focus ring tuned to brand teal. The padding + font sizes mirror the mock.
  const inputClass =
    "w-full rounded-[10px] border bg-white px-[14px] py-[12px] text-[15px] text-navy placeholder:text-[#b6bccb] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--color-teal)_28%,transparent)] focus:border-teal transition-shadow";

  return (
    <div
      className="w-full max-w-[520px] rounded-[20px] border bg-white p-9 pb-8 max-md:rounded-[14px] max-md:p-6"
      style={{
        borderColor: "var(--color-warm-grid-strong)",
        boxShadow: "var(--shadow-form)",
      }}
    >
      <span className="dq-eyebrow">Verify ownership</span>
      <h2 className="mt-3 text-[20px] font-semibold leading-tight tracking-[-0.014em] text-navy">
        Claim {pmName}.
      </h2>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="mt-[22px]"
      >
        {/* Name */}
        <div className="mb-[18px]">
          <label
            htmlFor="claim-name"
            className="mb-[7px] block text-[13.5px] font-medium leading-tight text-[#1f2c4a]"
          >
            Your name
          </label>
          <input
            id="claim-name"
            type="text"
            autoComplete="name"
            placeholder="Alex Morgan"
            aria-invalid={Boolean(form.formState.errors.contactName)}
            className={inputClass}
            style={{ borderColor: "var(--color-warm-input)" }}
            {...form.register("contactName")}
          />
          {form.formState.errors.contactName && (
            <p className="dq-field-error">
              {form.formState.errors.contactName.message}
            </p>
          )}
        </div>

        {/* Work email */}
        <div className="mb-[18px]">
          <label
            htmlFor="claim-email"
            className="mb-[7px] block text-[13.5px] font-medium leading-tight text-[#1f2c4a]"
          >
            Your work email
          </label>
          <input
            id="claim-email"
            type="email"
            autoComplete="email"
            placeholder="alex@yourcompany.com"
            aria-invalid={Boolean(form.formState.errors.contactEmail)}
            className={inputClass}
            style={{ borderColor: "var(--color-warm-input)" }}
            {...form.register("contactEmail")}
          />
          {form.formState.errors.contactEmail ? (
            <p className="dq-field-error">
              {form.formState.errors.contactEmail.message}
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
              We verify ownership using your work email domain. Use an email at
              the PM&rsquo;s company domain.
            </p>
          )}
        </div>

        <p className="my-[18px] text-[13px] italic leading-snug text-muted-foreground">
          We will send a verification link to your email. After clicking it,
          you&rsquo;ll have access to your profile within 1 business day.
        </p>

        {submitState.kind === "error" && (
          <p className="mb-3 text-[13px] font-medium text-[color:var(--color-bad)]">
            {submitState.message}
          </p>
        )}

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-navy px-4 py-[14px] text-[15px] font-semibold text-white transition-colors hover:bg-navy-700 active:translate-y-[1px] disabled:opacity-60"
        >
          {form.formState.isSubmitting ? (
            "Submitting…"
          ) : (
            <>
              Submit claim
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>

        <p className="mt-[18px] text-center text-[12.5px] italic leading-snug text-muted-foreground">
          Have questions before claiming? Email{" "}
          <a
            href="mailto:claims@dwellsy.com"
            className="not-italic font-medium text-teal hover:text-teal-700"
          >
            claims@dwellsy.com
          </a>{" "}
          or read our{" "}
          <Link
            href="/methodology"
            className="not-italic font-medium text-teal hover:text-teal-700"
          >
            methodology
          </Link>
          .
        </p>
      </form>
    </div>
  );
}

// Success card — quiet confirmation. Matches the form card's white surface +
// strong warm border + form shadow. Holds a 48×48 check pill, the heading,
// confirmation copy with the submitted email in navy weight 600, a hairline
// divider, and the resend action stack. Below the card sits a quiet
// back-to-scorecard link.
function SuccessCard({
  email,
  scorecardHref,
}: {
  email: string;
  scorecardHref: string;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      <article
        className="w-full max-w-[520px] rounded-[20px] border bg-white px-10 pb-9 pt-11 text-center max-md:rounded-[14px] max-md:px-6 max-md:pb-7 max-md:pt-8"
        style={{
          borderColor: "var(--color-warm-grid-strong)",
          boxShadow: "var(--shadow-form)",
        }}
      >
        <CheckPill />
        <h2 className="dq-h2 mt-[22px] text-[28px]">
          Claim received. Verify your email to continue.
        </h2>
        <p className="mt-3.5 text-[15.5px] leading-[1.6] text-muted-foreground">
          We sent a verification link to{" "}
          <strong className="font-semibold text-navy">{email}</strong>. Click
          the link in the email to confirm you&rsquo;re the operator. Your
          dashboard will be ready within 1 business day.
        </p>

        <hr
          className="mx-[-40px] my-6 border-0 border-t max-md:mx-[-24px]"
          style={{ borderColor: "var(--color-warm-grid)" }}
        />

        <ResendStack />
      </article>
      <p className="mt-6 text-center text-[13.5px]">
        <Link
          href={scorecardHref}
          className="text-muted-foreground transition-colors hover:text-navy"
        >
          ← Back to your scorecard
        </Link>
      </p>
    </div>
  );
}

function CheckPill() {
  return (
    <div
      className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
      style={{
        background: "var(--color-success-soft)",
        color: "var(--color-success)",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4.5 12.5l5 5 10-11" />
      </svg>
    </div>
  );
}

// Resend stack — teal text-link plus a small meta line. We don't actually
// re-send (no public resend endpoint yet) but the UI affords it; the button
// shows "Sending…" optimistically and then stays disabled for 30s. State is
// expressed as discrete phases so render stays pure (no Date.now() reads).
function ResendStack() {
  const [phase, setPhase] = useState<"idle" | "sending" | "cooldown">("idle");

  function handleResend() {
    if (phase !== "idle") return;
    setPhase("sending");
    // Simulate a request — replace with a real POST to /api/claims/resend
    // when the endpoint exists.
    window.setTimeout(() => {
      setPhase("cooldown");
      window.setTimeout(() => setPhase("idle"), 30_000);
    }, 600);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleResend}
        disabled={phase !== "idle"}
        className="text-[14px] font-medium text-teal transition-colors hover:text-teal-700 disabled:cursor-default disabled:opacity-60"
      >
        {phase === "sending" ? "Sending…" : "Resend verification email"}
      </button>
      <p className="mt-1.5 text-[12px] text-muted-2">
        Sent just now · check spam if it doesn&rsquo;t arrive
      </p>
    </div>
  );
}
