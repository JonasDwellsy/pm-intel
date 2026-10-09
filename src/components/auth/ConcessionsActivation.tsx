"use client";
import Image from "next/image";
import { useState } from "react";
import { SignIn, SignUp, useClerk } from "@clerk/nextjs";
import {iqLoginLink} from "@/lib/auth/iq-login-return";
import { CONCESSIONS_ACTIVATION_ORIGIN, CONCESSIONS_CONSENT_VERSION } from "@/lib/auth/concessions-activation";
import styles from "./ConcessionsActivation.module.css";

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
  return <section className={styles.shell} aria-label="Your Concessions invitation">
    <header className={styles.header}>
      <Image src="/brand/dwellsy-iq-concessions-ink-transparent.png" alt="Dwellsy IQ Concessions" width={1083} height={446} priority />
      <span>Your Dwellsy listing-partner benefit</span>
    </header>
    <div className={styles.card}>
      <aside className={styles.intro}>
        <span className={styles.eyebrow}>Your listing-partner benefit</span>
        <h2>You list on Dwellsy.<br />Your team gets<br />Concessions, free.</h2>
        <p>Our thank-you to active listing partners: a view of nearby offers and monthly rent discounts, included at no additional cost.</p>
        <div className={styles.mapArt} aria-hidden="true"><span className={styles.river} /><span className={styles.street} /><i /><i /><i /><b>8% off</b><b>Waived fee</b><b>5% off</b></div>
        <span className={styles.caption}>Illustrative offers</span>
        <div className={styles.benefit}><span aria-hidden="true">✓</span><p>Keep listing with Dwellsy.<br /><strong>Keep your team’s Concessions benefit.</strong></p></div>
      </aside>
      <div className={styles.content}>
        <span className={styles.confirmed}><span aria-hidden="true">✓</span> Invitation confirmed</span>
        <h1>Welcome to<br />Concessions.</h1>
        <p>Your company is already approved. Agree to the Terms of Use, and we’ll open your Concessions workspace.</p>
        <label className={styles.terms}><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)} /><span>I agree to the <a href="https://dwellsy.com/pages/terms-of-use" target="_blank" rel="noopener noreferrer">Dwellsy Terms of Use<span className="sr-only"> (opens in a new tab)</span></a>.</span></label>
        <button className={styles.primary} disabled={!accepted || busy || !clerk.loaded} onClick={()=>void activate()}>{busy ? "Checking your invitation…" : "Open Concessions"}<span aria-hidden="true">→</span></button>
        {message && <p className={styles.error} role="alert">{message}</p>}
        <button className={styles.secondary} onClick={()=>void clerk.signOut({redirectUrl:`${CONCESSIONS_ACTIVATION_ORIGIN}/invitations/activate?token=${token}`})}>Sign out and use another account</button>
      </div>
    </div>
    <p className={styles.footnote}>Dwellsy IQ Concessions · A benefit for property managers who list on Dwellsy.</p>
  </section>;
}
