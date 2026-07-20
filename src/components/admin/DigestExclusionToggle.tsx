"use client";

// Admin control: exclude an org from all outbound digest emails (brief +
// watch-list). For internal / demo / comp accounts. Mirrors the useActionState
// pattern of the other admin forms; the checkbox auto-submits on change.

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  setOrganizationDigestExclusion,
  type SetDigestExclusionResult,
} from "@/app/admin/organizations/actions";

function Status({ initial }: { initial: boolean }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="text-[12px] text-grey-500">Saving…</span>;
  return (
    <span className="text-[12px] text-grey-500">
      {initial ? "Excluded — no digests sent." : "Receiving digests."}
    </span>
  );
}

export function DigestExclusionToggle({
  orgId,
  initialExcluded,
}: {
  orgId: string;
  initialExcluded: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<SetDigestExclusionResult | null, FormData>(
    async (prev, formData) => setOrganizationDigestExclusion(prev, formData),
    null
  );
  // After a save, `state.excluded` is the source of truth; before, the DB value.
  const current = state?.ok ? state.excluded! : initialExcluded;

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="orgId" value={orgId} />
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="excluded"
          defaultChecked={initialExcluded}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-4 w-4"
        />
        <span>Exclude from digest emails</span>
        <Status initial={current} />
      </label>
      {state && !state.ok && state.error ? (
        <p className="mt-1 text-[12px] text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
