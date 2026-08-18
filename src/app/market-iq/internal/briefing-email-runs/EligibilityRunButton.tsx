"use client";

import { useActionState } from "react";
import { runMarketIqBriefingEligibilityCheck } from "./actions";

type State = { ok: boolean; error?: string; runId?: string } | null;

export function EligibilityRunButton() {
  const [state, action, pending] = useActionState<State, FormData>(async () => runMarketIqBriefingEligibilityCheck(), null);
  return <div>
    <form action={action}>
      <button disabled={pending} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
        {pending ? "Checking eligibility…" : "Run eligibility check"}
      </button>
    </form>
    {state?.ok && <p className="mt-2 text-xs text-emerald-700">Dry run recorded. No email was sent.</p>}
    {state && !state.ok && <p className="mt-2 text-xs text-rose-700">{state.error}</p>}
  </div>;
}
