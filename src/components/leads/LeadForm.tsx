"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  RadioCardGroup,
  type RadioCardOption,
} from "@/components/ui/RadioCardGroup";
import { PillSelector, type PillOption } from "@/components/ui/PillSelector";
import {
  leadFormSchema,
  leadFormToApiPayload,
  QUADRANTS,
  type LeadFormValues,
  type PropertyType,
} from "@/lib/lead-schema";
import { capture } from "@/lib/analytics";

type MarketOption = { id: string; fullName: string };

const PROPERTY_OPTIONS: ReadonlyArray<RadioCardOption<PropertyType>> = [
  {
    value: "single-family",
    title: "Single-family",
    description: "One detached home or unit you own outright.",
  },
  {
    value: "small-mf",
    title: "Small multifamily",
    description: "2–4 units in a single building.",
  },
  {
    value: "multifamily",
    title: "Multifamily",
    description: "5+ unit building or larger community.",
  },
  {
    value: "condo",
    title: "Condo / townhome",
    description: "One unit inside an HOA-governed building.",
  },
];

const QUADRANT_PILLS: ReadonlyArray<PillOption<string>> = [
  { value: "", label: "No preference" },
  ...QUADRANTS.map((q) => ({ value: q, label: q })),
];

// Small required-marker symbol used inline on labels.
function Req() {
  return (
    <span aria-hidden className="ml-0.5 text-orange">
      *
    </span>
  );
}

function GroupEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal">
      {children}
    </p>
  );
}

export function LeadForm({ markets }: { markets: MarketOption[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    mode: "onBlur",
    defaultValues: {
      marketId: "",
      propertyType: undefined as unknown as LeadFormValues["propertyType"],
      unitCount: "",
      preferredQuadrant: "",
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      notes: "",
    },
  });

  const onSubmit = async (values: LeadFormValues) => {
    setSubmitError(null);
    const payload = {
      ...leadFormToApiPayload(values),
      source:
        typeof document !== "undefined" ? document.referrer || undefined : undefined,
    };
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body.error ?? "Submission failed. Please try again.";
        capture("lead_form_submit_error", {
          marketId: payload.marketId,
          propertyType: payload.propertyType,
          status: res.status,
          errorReason: message,
        });
        setSubmitError(message);
        return;
      }
      const { leadId } = await res.json();
      capture("lead_form_submit_success", {
        marketId: payload.marketId,
        propertyType: payload.propertyType,
        leadId,
      });
      // PR #46 — /get-matched/confirmation deleted as part of the
      // /get-matched deprecation. The next.config.ts redirect picks
      // the stale path up and lands on /watch-lists/new, but routing
      // there directly skips the unnecessary 301 hop. The LeadForm
      // itself is no longer rendered by any page; left intact per
      // spec ("keep functional lead-capture logic intact if useful
      // for sales conversations").
      router.push(`/watch-lists/new?leadId=${leadId}`);
    } catch {
      capture("lead_form_submit_error", {
        marketId: payload.marketId,
        propertyType: payload.propertyType,
        errorReason: "network_error",
      });
      setSubmitError("Network error. Please try again.");
    }
  };

  const inputClass =
    "h-11 w-full rounded-md border border-grid bg-surface-soft px-3.5 py-2 text-[15px] text-navy placeholder:text-muted-2 focus-visible:border-teal focus-visible:ring-[3px] focus-visible:ring-teal/15 outline-none";

  const selectClass =
    inputClass +
    " appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22><path fill=%22none%22 stroke=%22%235C6573%22 stroke-width=%221.4%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M1 1l4 4 4-4%22/></svg>')] bg-no-repeat pr-9";

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="rounded-lg border border-grid bg-white p-8 sm:p-12 sm:px-14"
        noValidate
      >
        {/* === PROPERTY === */}
        <section>
          <GroupEyebrow>Property</GroupEyebrow>

          <FormField
            control={form.control}
            name="propertyType"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="text-[14px] font-semibold text-navy">
                  Property type
                  <Req />
                </FormLabel>
                <FormControl>
                  <RadioCardGroup<PropertyType>
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={PROPERTY_OPTIONS}
                    columns={2}
                    ariaLabel="Property type"
                    required
                  />
                </FormControl>
                {fieldState.error && (
                  <FormMessage className="text-[12.5px] italic text-bad" />
                )}
              </FormItem>
            )}
          />

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="unitCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[14px] font-semibold text-navy">
                    Number of units
                    <Req />
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="1"
                      {...field}
                      value={field.value ?? ""}
                      className={inputClass}
                    />
                  </FormControl>
                  <FormMessage className="text-[12.5px] italic text-bad" />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* === LOCATION === */}
        <section className="mt-9 border-t border-grid pt-9">
          <GroupEyebrow>Location</GroupEyebrow>
          <FormField
            control={form.control}
            name="marketId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[14px] font-semibold text-navy">
                  Market
                  <Req />
                </FormLabel>
                <FormControl>
                  <select
                    {...field}
                    value={field.value ?? ""}
                    className={selectClass}
                  >
                    <option value="">Select a market…</option>
                    {markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  Pre-filled if you arrived from a market page.
                </p>
                <FormMessage className="text-[12.5px] italic text-bad" />
              </FormItem>
            )}
          />
        </section>

        {/* === PREFERENCES === */}
        <section className="mt-9 border-t border-grid pt-9">
          <GroupEyebrow>Preferences</GroupEyebrow>
          <FormField
            control={form.control}
            name="preferredQuadrant"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[14px] font-semibold text-navy">
                  Preferred operator type
                </FormLabel>
                <FormControl>
                  <PillSelector
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={QUADRANT_PILLS}
                    ariaLabel="Preferred operator type"
                    emptyValue=""
                  />
                </FormControl>
                <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                  Operator type determines what fits your goals — institutional
                  scale vs. independent attention.{" "}
                  <a
                    href="/methodology#classification"
                    className="text-teal hover:text-teal-700"
                  >
                    Learn more in methodology →
                  </a>
                </p>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="mt-7">
                <FormLabel className="text-[14px] font-semibold text-navy">
                  What matters most?
                </FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={4}
                    placeholder="Pricing strategy, communication frequency, asset class, timing — anything we should flag to the matched operators."
                    className="block min-h-[120px] w-full resize-y rounded-md border border-grid bg-surface-soft px-3.5 py-2.5 text-[15px] leading-[1.5] text-navy placeholder:text-muted-2 focus-visible:border-teal focus-visible:ring-[3px] focus-visible:ring-teal/15 outline-none"
                  />
                </FormControl>
                <FormMessage className="text-[12.5px] italic text-bad" />
              </FormItem>
            )}
          />
        </section>

        {/* === CONTACT === */}
        <section className="mt-9 border-t border-grid pt-9">
          <GroupEyebrow>Contact</GroupEyebrow>
          {/* Row 1: Name + Email — equal-width columns on desktop, stack on mobile */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="flex flex-col">
              <Label htmlFor="ownerName" className="dq-field-label">
                Name
                <Req />
              </Label>
              <Input
                id="ownerName"
                placeholder="Jane Bordo"
                aria-invalid={
                  form.formState.errors.ownerName ? "true" : undefined
                }
                {...form.register("ownerName")}
                className={`${inputClass} w-full`}
              />
              {form.formState.errors.ownerName && (
                <p className="dq-field-error">
                  {form.formState.errors.ownerName.message}
                </p>
              )}
            </div>
            <div className="flex flex-col">
              <Label htmlFor="ownerEmail" className="dq-field-label">
                Email
                <Req />
              </Label>
              <Input
                id="ownerEmail"
                type="email"
                placeholder="jane@example.com"
                aria-invalid={
                  form.formState.errors.ownerEmail ? "true" : undefined
                }
                {...form.register("ownerEmail")}
                className={`${inputClass} w-full`}
              />
              {form.formState.errors.ownerEmail ? (
                <p className="dq-field-error">
                  {form.formState.errors.ownerEmail.message}
                </p>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  We send matches here.
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Phone — full-width */}
          <div className="mt-5 flex flex-col">
            <Label htmlFor="ownerPhone" className="dq-field-label">
              Phone
            </Label>
            <Input
              id="ownerPhone"
              type="tel"
              placeholder="(555) 555-5555"
              aria-invalid={
                form.formState.errors.ownerPhone ? "true" : undefined
              }
              {...form.register("ownerPhone")}
              className={`${inputClass} w-full`}
            />
            {form.formState.errors.ownerPhone ? (
              <p className="dq-field-error">
                {form.formState.errors.ownerPhone.message}
              </p>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                Optional. Operators may use this to reach you if you don&apos;t
                respond by email.
              </p>
            )}
          </div>
        </section>

        {submitError && (
          <p className="mt-6 text-[13px] italic text-bad">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={
            "mt-9 inline-flex h-14 w-full items-center justify-center gap-2 rounded-md text-[16px] font-medium text-white transition-colors " +
            (isSubmitting
              ? "cursor-not-allowed bg-[#aab1be]"
              : "bg-navy hover:bg-navy-700")
          }
        >
          {isSubmitting ? (
            <>
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Routing matches…
            </>
          ) : (
            <>Get matched →</>
          )}
        </button>
      </form>
    </Form>
  );
}
