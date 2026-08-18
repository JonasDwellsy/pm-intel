"use client";

import Link from "next/link";

export default function MarketIqActivationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="min-h-screen bg-[#f7f7f4] px-5 py-16"><section className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">Setup could not reload</p><h1 className="mt-3 text-3xl font-bold text-navy">Try the setup page again</h1><p className="mt-4 text-sm leading-6 text-slate-600">A market source or workspace service did not respond. Any progress saved before this page appeared may already be intact.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={reset} className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">Return to setup</button><Link href="/market-iq" className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-navy">Exit safely</Link></div><p className="mt-5 text-xs leading-5 text-slate-400">No report was published and no email was sent.</p></section></main>;
}
