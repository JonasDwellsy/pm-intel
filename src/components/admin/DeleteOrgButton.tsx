"use client";

// v0.23 — Danger-zone control for permanently deleting an organization.
//
// Two-step so it can't be fat-fingered: the primary button "arms" the
// control, revealing a typed-name confirmation (the admin must re-type
// the org's exact name) before the destructive submit enables. Mirrors
// the useActionState pattern used by the other admin forms; on success
// it routes back to the org list (the deleted org's detail page no
// longer exists).

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  deleteOrganization,
  type DeleteOrganizationResult,
} from "@/app/admin/organizations/actions";

function ConfirmButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!enabled || pending}
      className="rounded-md bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete this organization"}
    </button>
  );
}

export function DeleteOrgButton({
  orgId,
  orgName,
  memberCount,
  watchListCount,
}: {
  orgId: string;
  orgName: string;
  memberCount: number;
  watchListCount: number;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");

  const [state, formAction] = useActionState<
    DeleteOrganizationResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await deleteOrganization(prev, formData);
    if (result.ok) {
      router.push("/admin/organizations");
      router.refresh();
    }
    return result;
  }, null);

  const nameMatches = typed.trim() === orgName.trim();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-[13px] font-semibold text-red-700 hover:bg-red-50"
      >
        Delete organization…
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="orgId" value={orgId} />
      <p className="text-[13px] text-grey-700">
        This permanently deletes <span className="font-semibold">{orgName}</span>
        {(memberCount > 0 || watchListCount > 0) && (
          <>
            {" "}and removes{" "}
            <span className="font-semibold">
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>{" "}
            and{" "}
            <span className="font-semibold">
              {watchListCount} {watchListCount === 1 ? "watch list" : "watch lists"}
            </span>
          </>
        )}
        . This can&apos;t be undone.
      </p>
      <div>
        <label
          htmlFor="confirm-name"
          className="block text-[12px] font-semibold uppercase tracking-wider text-grey-600 mb-1"
        >
          Type <span className="font-mono normal-case text-red-700">{orgName}</span>{" "}
          to confirm
        </label>
        <input
          id="confirm-name"
          name="confirmName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          placeholder={orgName}
          className="w-full max-w-[360px] rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy placeholder:text-grey-400 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <ConfirmButton enabled={nameMatches} />
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setTyped("");
          }}
          className="rounded-md px-3 py-2 text-[13px] font-semibold text-grey-600 hover:text-navy"
        >
          Cancel
        </button>
        {state && !state.ok && state.error && (
          <span className="text-[13px] text-red-700">{state.error}</span>
        )}
      </div>
    </form>
  );
}
