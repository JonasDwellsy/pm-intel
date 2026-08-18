"use client";

export function MarketIqPrintButton() {
  return <button
    type="button"
    onClick={() => window.print()}
    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-teal-600 hover:text-teal-700 print:hidden"
  >
    Print briefing
  </button>;
}
