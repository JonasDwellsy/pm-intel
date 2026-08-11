"use client";

export function PrintOwnerBriefingButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-md border border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft print:hidden">Print or save PDF</button>;
}
