import Link from "next/link";

const STEPS = [
  { key: "setup", label: "Setup", href: "/market-iq/get-started?flow=launch" },
  { key: "edition", label: "Review edition", href: "/market-iq/report?flow=launch" },
  { key: "recipients", label: "Add recipients", href: "/market-iq/distribution?flow=launch#add-recipient" },
  { key: "delivery", label: "Prepare delivery", href: "/market-iq/launch" },
] as const;

export function MarketIqLaunchJourney({ current }: { current: typeof STEPS[number]["key"] }) {
  return <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.13em] text-teal-700">First-edition setup</p><Link href="/market-iq/launch" className="text-sm font-semibold text-navy">Back to checklist</Link></div><nav className="mt-3 grid gap-2 sm:grid-cols-4">{STEPS.map((step, index) => <Link key={step.key} href={step.href} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${current === step.key ? "border-navy bg-navy text-white" : "border-slate-200 text-slate-600"}`}><span className="mr-2 text-xs opacity-65">{index + 1}</span>{step.label}</Link>)}</nav></section>;
}
