"use client";

// v0.21 — Create Organization form. Client component because we use
// useFormState + useFormStatus to show inline server-action results
// without a full page re-render.

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import {
  createOrganization,
  type CreateOrganizationResult,
} from "@/app/admin/organizations/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create organization"}
    </button>
  );
}

export function CreateOrganizationForm() {
  const [state, formAction] = useActionState<
    CreateOrganizationResult | null,
    FormData
  >(createOrganization, null);

  const formRef = useRef<HTMLFormElement>(null);

  // Reset the name field after a successful create so the admin can
  // chain multiple creates without manually clearing.
  useEffect(() => {
    if (state?.ok && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-grid bg-surface-soft p-4"
    >
      <div>
        <label
          htmlFor="org-name"
          className="block text-[12px] font-semibold uppercase tracking-wider text-grey-600 mb-1"
        >
          New organization
        </label>
        <input
          id="org-name"
          name="name"
          type="text"
          required
          maxLength={256}
          placeholder="Acme Capital Partners"
          className="w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy placeholder:text-grey-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state?.ok && (
          <span className="text-[13px] text-good">
            Created — refresh below shows the new org.
          </span>
        )}
        {state && !state.ok && state.error && (
          <span className="text-[13px] text-red-700">{state.error}</span>
        )}
      </div>
    </form>
  );
}
