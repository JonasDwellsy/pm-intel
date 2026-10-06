"use client";
import { useState } from "react";
import { SignIn, SignUp, useClerk } from "@clerk/nextjs";
import {iqLoginLink} from "@/lib/auth/iq-login-return";
import { CONCESSIONS_ACTIVATION_ORIGIN, CONCESSIONS_CONSENT_VERSION } from "@/lib/auth/concessions-activation";

export function ConcessionsActivation({token,mode,destination}:{token:string;mode:"sign-in"|"sign-up";destination:string}) {
  const clerk = useClerk();
  const [accepted,setAccepted] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const task = clerk.session?.currentTask?.key;
  // Completing an organization choice must never replace MFA/password tasks.
  if (task && task !== "choose-organization") return mode === "sign-in"
    ? <SignIn routing="path" path="/iq/sign-in" forceRedirectUrl={destination} signUpForceRedirectUrl={destination} signUpUrl={iqLoginLink("sign-up",destination)} />
    : <SignUp routing="path" path="/iq/sign-up" forceRedirectUrl={destination} signInForceRedirectUrl={destination} signInUrl={iqLoginLink("sign-in",destination)} />;
  async function activate() {
    if (!accepted || busy) return;
    setBusy(true);setMessage("");
    try {
      const response = await fetch("/iq/concessions/activate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,accepted:true,consentVersion:CONCESSIONS_CONSENT_VERSION})});
      const result = await response.json();
      if (!response.ok || !/^org_[a-zA-Z0-9]+$/.test(result.organizationId)) throw new Error("Your invitation could not be activated. Check that you used the invited work email, or contact jonas@dwellsy.com for help.");
      await clerk.setActive({organization:result.organizationId});
      window.location.assign(`${CONCESSIONS_ACTIVATION_ORIGIN}/app?__clerk_synced=false`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Activation could not be confirmed. Contact Dwellsy before retrying."); }
    // No immediate retry after an ambiguous external membership operation.
  }
  return <section className="flex w-full max-w-[440px] flex-col gap-5 rounded-xl border bg-white p-8">
    <h1 className="text-2xl font-semibold text-navy">Open Dwellsy IQ Concessions</h1>
    <p>Continue with the work email that received your invitation. Concessions will check your invitation and company eligibility before adding you to the approved workspace.</p>
    <label className="flex items-start gap-3"><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)} /><span>I agree to the <a className="underline" href="https://dwellsy.com/pages/terms-of-use" target="_blank" rel="noopener noreferrer">Dwellsy Terms of Use</a>.</span></label>
    <button className="rounded-md bg-yellow-300 px-5 py-3 font-semibold disabled:opacity-50" disabled={!accepted || busy || !clerk.loaded} onClick={()=>void activate()}>{busy ? "Checking your invitation…" : "Open Concessions"}</button>
    {message && <p role="alert">{message}</p>}
    <button className="underline" onClick={()=>void clerk.signOut({redirectUrl:`${CONCESSIONS_ACTIVATION_ORIGIN}/invitations/activate?token=${token}`})}>Sign out and use another account</button>
  </section>;
}
