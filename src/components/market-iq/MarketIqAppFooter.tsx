import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

async function signedIn() {
  try {
    return Boolean((await auth()).userId);
  } catch {
    return false;
  }
}

export async function MarketIqAppFooter() {
  const isSignedIn = await signedIn();
  return (
    <footer className="border-t border-grid bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-6 py-7 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <Link href={isSignedIn ? "/market-iq" : "/market-iq/welcome"} aria-label="Dwellsy IQ Market IQ" className="flex items-center gap-3 text-navy">
          <Image src="/dwellsy-iq-logo.png" alt="Dwellsy IQ" width={90} height={28} className="h-7 w-auto" />
          <span aria-hidden className="h-4 w-px bg-grid" />
          <span className="text-xs font-semibold">Market IQ</span>
          <span className="hidden text-xs text-muted-2 sm:inline">A Dwellsy IQ product</span>
        </Link>
        <nav className="flex flex-wrap gap-5 text-xs text-muted-foreground">
          {isSignedIn ? <><Link href="/market-iq/get-started" className="hover:text-navy">Workspace setup</Link><Link href="/market-iq/subscribe" className="hover:text-navy">Plan and billing</Link></> : <><Link href="/market-iq/welcome#product" className="hover:text-navy">Product</Link><Link href="/market-iq/welcome#plans" className="hover:text-navy">Plans</Link><Link href="/sign-in?redirect_url=/market-iq" className="hover:text-navy">Sign in</Link></>}
          <Link href="/privacy" className="hover:text-navy">Privacy</Link>
          <Link href="/terms" className="hover:text-navy">Terms</Link>
          <span>© {new Date().getFullYear()} Dwellsy, Inc.</span>
        </nav>
      </div>
    </footer>
  );
}
