"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  leadFormSchema,
  leadFormToApiPayload,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  QUADRANTS,
  type LeadFormValues,
} from "@/lib/lead-schema";
import { capture } from "@/lib/analytics";

type MarketOption = { id: string; fullName: string };

export function LeadForm({ markets }: { markets: MarketOption[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
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
      router.push(`/get-matched/confirmation?leadId=${leadId}`);
    } catch {
      capture("lead_form_submit_error", {
        marketId: payload.marketId,
        propertyType: payload.propertyType,
        errorReason: "network_error",
      });
      setSubmitError("Network error. Please try again.");
    }
  };

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none";

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <FormField
          control={form.control}
          name="marketId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Market</FormLabel>
              <FormControl>
                <select
                  {...field}
                  value={field.value ?? ""}
                  className={selectClass}
                >
                  <option value="">No preference</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="propertyType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property type *</FormLabel>
              <FormControl>
                <select
                  {...field}
                  value={field.value ?? ""}
                  className={selectClass}
                >
                  <option value="" disabled>
                    Select a property type
                  </option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PROPERTY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="unitCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit count</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="e.g. 24"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="preferredQuadrant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred operator profile</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    value={field.value ?? ""}
                    className={selectClass}
                  >
                    <option value="">No preference (we'll infer)</option>
                    {QUADRANTS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your contact
          </p>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="ownerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="Optional"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anything else?</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                      placeholder="Asset class, timing, what you're solving for..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className={buttonVariants({ size: "lg" })}
          >
            {form.formState.isSubmitting ? "Matching…" : "Get matched"}
          </button>
        </div>
      </form>
    </Form>
  );
}
