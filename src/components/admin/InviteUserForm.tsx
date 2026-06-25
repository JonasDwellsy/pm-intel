"use client";

// v0.21 — Invite User to an organization. Mirrors CreateOrganizationForm's
// useActionState pattern.

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import {
  inviteUserToOrganization,
  type InviteUserResult,
} from "@/app/admin/organizations/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send invitation"}
    </button>
  );
}

export function InviteUserForm({ clerkOrgId }: { clerkOrgId: string }) {
  const [state, formAction] = useActionState<
    InviteUserResult | null,
    FormData
  >(inviteUserToOrganization, null);

  const formRef = useRef<HTMLFormElement>(null);

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
      <input type="hidden" name="clerkOrgId" value={clerkOrgId} />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
        <div>
          <label
            htmlFor="invite-email"
            className="block text-[12px] font-semibold uppercase tracking-wider text-grey-600 mb-1"
          >
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="contact@customer.com"
            className="w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy placeholder:text-grey-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label
            htmlFor="invite-role"
            className="block text-[12px] font-semibold uppercase tracking-wider text-grey-600 mb-1"
          >
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="org:member"
            className="w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="org:member">Member</option>
            <option value="org:admin">Admin</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state?.ok && state.email && (
          <span className="text-[13px] text-good">
            Invitation sent to {state.email}.
          </span>
        )}
        {state && !state.ok && state.error && (
          <span className="text-[13px] text-red-700">{state.error}</span>
        )}
      </div>
    </form>
  );
}
