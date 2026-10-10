import Image from "next/image";
import { RedirectToTasks, SignIn, SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { iqLoginLink, iqLoginReturn, type LoginQuery } from "@/lib/auth/iq-login-return";
import { IQ_LOGIN_RETURN_COOKIE, recoverIqLoginReturn } from "@/lib/auth/iq-session-tasks";
import { concessionsActivationToken, concessionsBridgeEnabled } from "@/lib/auth/concessions-activation";
import { ConcessionsActivation } from "./ConcessionsActivation";

export async function IqLogin({ mode, query }: { mode: "sign-in" | "sign-up"; query: LoginQuery }) {
  const requestedDestination = iqLoginReturn(query);
  const hasRequestedDestination = [
    query.sign_in_force_redirect_url,
    query.sign_up_force_redirect_url,
    query.redirect_url,
  ].some((value) => value !== undefined);
  const rememberedDestination = requestedDestination || hasRequestedDestination
    ? null
    : recoverIqLoginReturn((await cookies()).get(IQ_LOGIN_RETURN_COOKIE)?.value);
  const destination = requestedDestination ?? rememberedDestination;
  const invitationToken = concessionsActivationToken(destination);
  if (invitationToken && concessionsBridgeEnabled() && (await auth({treatPendingAsSignedOut:false})).userId) {
    return <main className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12"><ConcessionsActivation token={invitationToken} mode={mode} destination={destination!} /></main>;
  }
  if (destination && (await auth()).userId) redirect(destination);
  return <main className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12">
    <section className="flex w-full max-w-[400px] flex-col items-center text-center">
      {destination && <RedirectToTasks />}
      {destination ? (mode === "sign-in"
        ? <SignIn routing="path" path="/iq/sign-in" forceRedirectUrl={destination} signUpForceRedirectUrl={destination} signUpUrl={iqLoginLink("sign-up", destination)} />
        : <SignUp routing="path" path="/iq/sign-up" forceRedirectUrl={destination} signInForceRedirectUrl={destination} signInUrl={iqLoginLink("sign-in", destination)} />) : <>
        <Image src="/dwellsy-iq-logo.png" alt="Dwellsy IQ" width={180} height={57} priority />
        <h1 className="mt-6 text-2xl font-semibold text-navy">Open sign-in from your product</h1>
        <p className="mt-3 text-sm text-muted-foreground">This link is missing a valid return address. Please return to your Dwellsy IQ product and choose Sign in.</p>
      </>}
    </section>
  </main>;
}
