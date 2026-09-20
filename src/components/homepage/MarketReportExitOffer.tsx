"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { capture } from "@/lib/analytics";

export type MarketReportOption = {
  id: string;
  label: string;
};

const DISMISSED_KEY = "dwellsy_market_report_offer_dismissed";
const RECEIVED_KEY = "dwellsy_market_report_received";
const ARM_DELAY_MS = 5_000;

export function MarketReportExitOffer({
  markets,
}: {
  markets: MarketReportOption[];
}) {
  const [open, setOpen] = useState(false);
  const [marketId, setMarketId] = useState("");
  const [email, setEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState("");
  const marketRef = useRef<HTMLSelectElement>(null);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // See storage note below.
    }
    capture("market_report_offer_dismissed", {
      source: "homepage_exit_intent",
    });
  }, []);

  useEffect(() => {
    let armed = false;
    let shown = false;

    try {
      if (
        window.localStorage.getItem(RECEIVED_KEY) ||
        window.sessionStorage.getItem(DISMISSED_KEY)
      ) {
        return;
      }
    } catch {
      // Storage can be unavailable in hardened browsers. The offer still works.
    }

    if (!window.matchMedia("(pointer: fine)").matches) return;

    const timer = window.setTimeout(() => {
      armed = true;
    }, ARM_DELAY_MS);

    const onMouseOut = (event: MouseEvent) => {
      if (
        !armed ||
        shown ||
        event.relatedTarget !== null ||
        event.clientY > 12
      ) {
        return;
      }
      shown = true;
      setOpen(true);
      capture("market_report_offer_viewed", {
        source: "homepage_exit_intent",
      });
    };

    document.addEventListener("mouseout", onMouseOut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => marketRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dismiss, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!marketId) {
      setError("Choose your home market.");
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch("/api/market-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId,
          email,
          source: "homepage_exit_intent",
          companyWebsite,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "We could not send the report.");
      }

      setStatus("sent");
      try {
        window.localStorage.setItem(RECEIVED_KEY, "1");
      } catch {
        // A successful request should not be downgraded by storage settings.
      }
      capture("market_report_requested", {
        source: "homepage_exit_intent",
        marketId,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "We could not send the report. Please try again.";
      setError(message);
      setStatus("error");
      capture("market_report_request_failed", {
        source: "homepage_exit_intent",
        marketId,
      });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-report-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/55 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="relative grid w-full max-w-[780px] overflow-hidden rounded-xl border border-white/30 bg-white shadow-[0_30px_90px_-24px_rgb(15_31_63_/_0.65)] md:grid-cols-[0.82fr_1.18fr]">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close market report offer"
          className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-grid bg-white/90 text-xl leading-none text-muted-foreground transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          ×
        </button>

        <div className="hidden min-h-[470px] flex-col justify-between bg-navy p-8 text-white md:flex">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
              Operator IQ
            </p>
            <div className="mt-12 rounded-lg border border-white/15 bg-white/[0.06] p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-[11px] uppercase tracking-[0.12em] text-white/55">
                  Market read
                </span>
                <span className="size-2 rounded-full bg-orange" />
              </div>
              <div className="mt-5 space-y-4">
                <ReportLine label="Operator landscape" width="84%" />
                <ReportLine label="Leasing speed" width="66%" />
                <ReportLine label="Rent movement" width="74%" />
                <ReportLine label="Notable signals" width="58%" />
              </div>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-white/55">
            Independent intelligence built from observed rental-listing
            activity.
          </p>
        </div>

        <div className="px-6 pb-7 pt-16 sm:px-10 sm:pb-10 sm:pt-12">
          {status === "sent" ? (
            <div className="flex min-h-[330px] flex-col justify-center">
              <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-good-soft text-xl font-bold text-good">
                ✓
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal">
                Report sent
              </p>
              <h2
                id="market-report-title"
                className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.025em] text-navy"
              >
                Check your inbox.
              </h2>
              <p className="mt-4 max-w-[420px] text-[15px] leading-relaxed text-muted-foreground">
                Your market snapshot and a link to the live market view are on
                their way to {email}.
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="mt-7 w-fit text-[14px] font-semibold text-teal hover:text-teal-700"
              >
                Continue exploring
              </button>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-orange-700">
                Before you go
              </p>
              <h2
                id="market-report-title"
                className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.028em] text-navy sm:text-[34px]"
              >
                See what is changing in your home market.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                Get a free market report with operator activity, leasing speed,
                rent movement, and the signals worth watching.
              </p>

              <form onSubmit={submit} className="mt-7 space-y-4">
                <div>
                  <label
                    htmlFor="market-report-market"
                    className="mb-1.5 block text-[12px] font-semibold text-navy"
                  >
                    Home market
                  </label>
                  <select
                    ref={marketRef}
                    id="market-report-market"
                    value={marketId}
                    onChange={(event) => setMarketId(event.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-grid bg-white px-3 text-[14px] text-navy outline-none transition focus:border-teal focus:ring-3 focus:ring-teal/15"
                  >
                    <option value="">Choose a market</option>
                    {markets.map((market) => (
                      <option key={market.id} value={market.id}>
                        {market.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="market-report-email"
                    className="mb-1.5 block text-[12px] font-semibold text-navy"
                  >
                    Work email
                  </label>
                  <input
                    id="market-report-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    required
                    data-private
                    className="h-11 w-full rounded-lg border border-grid bg-white px-3 text-[14px] text-navy outline-none transition placeholder:text-muted-2 focus:border-teal focus:ring-3 focus:ring-teal/15"
                  />
                </div>
                <input
                  type="text"
                  name="companyWebsite"
                  value={companyWebsite}
                  onChange={(event) => setCompanyWebsite(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[10000px] h-px w-px overflow-hidden"
                />
                {error ? (
                  <p role="alert" className="text-[13px] text-destructive">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="flex h-11 w-full items-center justify-center rounded-lg bg-orange px-5 text-[14px] font-bold text-white transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-orange/30 disabled:cursor-wait disabled:opacity-65"
                >
                  {status === "sending" ? "Sending your report…" : "Email my free report"}
                </button>
              </form>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-2">
                One useful email, no recurring subscription. By requesting the
                report, you agree to our{" "}
                <a href="/privacy" className="underline hover:text-navy">
                  privacy policy
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportLine({ label, width }: { label: string; width: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/65">
        <span>{label}</span>
        <span aria-hidden>→</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10">
        <div className="h-1.5 rounded-full bg-teal" style={{ width }} />
      </div>
    </div>
  );
}
