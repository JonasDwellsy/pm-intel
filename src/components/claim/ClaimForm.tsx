"use client";

import { useState } from "react";
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
import { claimSchema, type ClaimInput } from "@/lib/lead-schema";
import { capture } from "@/lib/analytics";

export function ClaimForm({ pmSlug }: { pmSlug: string }) {
  const [submitState, setSubmitState] = useState<
    | { kind: "idle" }
    | { kind: "error"; message: string }
    | { kind: "submitted"; claimId: string }
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
          message: body.error ?? "Submission failed. Please try again.",
        });
        return;
      }
      const { claimId } = await res.json();
      capture("claim_form_submit_success", { pmSlug, claimId });
      setSubmitState({ kind: "submitted", claimId });
      form.reset({ pmSlug, contactName: "", contactEmail: "" });
    } catch {
      setSubmitState({ kind: "error", message: "Network error." });
    }
  };

  if (submitState.kind === "submitted") {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-medium">Claim received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We&rsquo;ll reach out at the email you provided to verify the claim.
          Reference: <code>{submitState.claimId}</code>
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="contactName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name *</FormLabel>
              <FormControl>
                <Input placeholder="Full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contactEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Work email *</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@yourcompany.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitState.kind === "error" && (
          <p className="text-sm text-destructive">{submitState.message}</p>
        )}

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className={buttonVariants()}
        >
          {form.formState.isSubmitting ? "Submitting…" : "Submit claim"}
        </button>
      </form>
    </Form>
  );
}
