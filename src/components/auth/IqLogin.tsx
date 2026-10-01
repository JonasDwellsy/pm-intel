import Image from "next/image";
import { SignIn, SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { iqLoginLink, iqLoginReturn, type LoginQuery } from "@/lib/auth/iq-login-return";

const productNames: Record<string, string> = {
  "https://concessions.iq.dwellsy.com": "Concessions",
  "https://dwellsy-iq-concessions.vercel.app": "Concessions",
  "https://evidence.iq.dwellsy.com": "Evidence",
  "https://portfolio.iq.dwellsy.com": "Portfolios",
};

const authAppearance = {
  elements: {
    logoBox: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
  },
} as const;

export async function IqLogin({ mode, query }: { mode: "sign-in" | "sign-up"; query: LoginQuery }) {
  const destination = iqLoginReturn(query);
  if (destination && (await auth()).userId) redirect(destination);
  const product = destination ? productNames[new URL(destination).origin] ?? "your product" : null;
  const title = destination
    ? mode === "sign-in" ? `Sign in to ${product}` : `Create your account for ${product}`
    : "Open sign-in from your product";
  return <main className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12">
    <section className="flex w-full max-w-[440px] flex-col items-center gap-6 text-center">
      <Image src="/dwellsy-iq-logo.png" alt="Dwellsy IQ" width={180} height={57} priority />
      <h1 className="text-2xl font-semibold text-navy">{title}</h1>
      <p className="text-sm text-muted-foreground">{destination ? `We’ll return you to ${product} when you’re done. Product access requirements still apply.` : "This link is missing a valid return address. Please return to the product and choose Sign in."}</p>
      {destination && (mode === "sign-in"
        ? <SignIn routing="path" path="/iq/sign-in" forceRedirectUrl={destination} signUpForceRedirectUrl={destination} signUpUrl={iqLoginLink("sign-up", destination)} appearance={authAppearance} />
        : <SignUp routing="path" path="/iq/sign-up" forceRedirectUrl={destination} signInForceRedirectUrl={destination} signInUrl={iqLoginLink("sign-in", destination)} appearance={authAppearance} />)}
    </section>
  </main>;
}
