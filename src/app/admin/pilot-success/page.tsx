import type { Metadata } from "next";
import Link from "next/link";
import { loadPilotSuccessCockpit } from "@/lib/portfolio-iq/pilot-success.server";
import type { PilotLifecycleStage } from "@/lib/portfolio-iq/pilot-success";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Pilot success",
  robots: { index: false, follow: false },
};

const STAGE_LABELS: Record<PilotLifecycleStage, string> = {
  setup: "Setup",
  launched: "Launched",
  engaged: "Engaged",
  getting_value: "Getting value",
  at_risk: "At risk",
};

function stageClass(stage: PilotLifecycleStage): string {
  if (stage === "getting_value") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (stage === "engaged") return "border-sky-200 bg-sky-50 text-sky-800";
  if (stage === "at_risk") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function dateLabel(value: Date | null): string {
  return value ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not yet";
}

export default async function PilotSuccessPage() {
  const pilots = await loadPilotSuccessCockpit();
  const gettingValue = pilots.filter((item) => item.stage === "getting_value").length;
  const atRisk = pilots.filter((item) => item.stage === "at_risk").length;
  const medianScore = pilots.length ? Math.round([...pilots].sort((a, b) => a.score - b.score)[Math.floor((pilots.length - 1) / 2)].score) : 0;
  const timeToValue = pilots.flatMap((item) => item.firstUsefulAt ? [Math.max(0, Math.round((item.firstUsefulAt.getTime() - (item.firstViewedAt ?? item.firstUsefulAt).getTime()) / 86_400_000 * 10) / 10)] : []);
  const medianTimeToValue = timeToValue.length ? [...timeToValue].sort((a, b) => a - b)[Math.floor((timeToValue.length - 1) / 2)] : null;

  return <div className="mx-auto max-w-[1100px] px-6 pb-16">
    <header className="mt-6 grid gap-6 rounded-xl border border-grid bg-navy p-6 text-white lg:grid-cols-[1fr_330px] lg:items-end">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Customer operations</p><h1 className="mt-2 text-3xl font-semibold">Pilot-success cockpit</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">See whether each pilot account is progressing from setup to sustained owner value, and identify the next staff intervention before momentum stalls.</p></div>
      <div className="rounded-lg border border-white/15 bg-white/5 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Operating principle</p><p className="mt-2 text-sm leading-6">A launched account is not yet a successful account. Success begins when an owner uses a finding to start a decision loop.</p></div>
    </header>

    <section className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-grid bg-white lg:grid-cols-4">{[
      ["Active pilots", pilots.length, "non-archived portfolios"],
      ["Getting value", gettingValue, "useful finding, PM response, or outcome"],
      ["At risk", atRisk, "needs staff intervention"],
      ["Median journey", `${medianScore}%`, medianTimeToValue === null ? "time to value not established" : `${medianTimeToValue} days from first view to first useful finding`],
    ].map(([label, value, detail]) => <div key={String(label)} className="border-b border-grid p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"><p className="text-[10px] font-bold uppercase tracking-wider text-grey-500">{label}</p><p className="mt-2 text-3xl font-semibold text-navy">{value}</p><p className="mt-1 text-xs leading-5 text-grey-500">{detail}</p></div>)}</section>

    <div className="mt-8 space-y-5">{pilots.map((pilot) => <article key={pilot.id} className="overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-grid px-5 py-5 sm:px-6"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-navy">{pilot.name}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${stageClass(pilot.stage)}`}>{STAGE_LABELS[pilot.stage]}</span></div><p className="mt-1 text-xs text-grey-500">{pilot.organization} · {pilot.marketId} · {pilot.ownerUsers} authorized users</p></div><div className="text-right"><p className="text-2xl font-semibold text-navy">{pilot.score}%</p><p className="text-[10px] font-bold uppercase tracking-wider text-grey-500">journey complete</p></div></div>
      <div className="grid lg:grid-cols-[1fr_300px]"><div className="p-5 sm:p-6"><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{pilot.milestones.map((milestone) => <div key={milestone.key} title={`${milestone.label}: ${milestone.detail}`} className={`rounded-md border px-2 py-3 text-center ${milestone.complete ? "border-emerald-200 bg-emerald-50" : "border-grid bg-surface-soft"}`}><span className={`mx-auto block h-2.5 w-2.5 rounded-full ${milestone.complete ? "bg-emerald-600" : "bg-grey-300"}`} /><p className="mt-2 text-[9px] font-bold uppercase leading-4 tracking-tight text-navy">{milestone.label}</p></div>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-4">{[
        ["First workspace view", dateLabel(pilot.firstViewedAt)],
        ["Last workspace view", dateLabel(pilot.lastViewedAt)],
        ["Time to first view", pilot.timeToFirstViewDays === null ? "Not yet" : `${pilot.timeToFirstViewDays} days`],
        ["Open corrections", String(pilot.openCorrections)],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-surface-soft p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-grey-500">{label}</p><p className="mt-1 text-sm font-semibold text-navy">{value}</p></div>)}</div></div>
        <aside className={`border-t border-grid p-5 lg:border-l lg:border-t-0 ${pilot.atRisk ? "bg-rose-50" : "bg-teal-soft"}`}><p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Next intervention</p><h3 className="mt-2 font-semibold leading-6 text-navy">{pilot.nextAction.label}</h3><p className="mt-2 text-xs text-grey-600">Owner: {pilot.nextAction.lane}</p>{pilot.daysSinceLastView !== null && <p className="mt-1 text-xs text-grey-600">Last active {pilot.daysSinceLastView} days ago</p>}<Link href={pilot.nextAction.href} className="mt-4 inline-flex rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Open workflow →</Link></aside>
      </div>
    </article>)}{pilots.length === 0 && <div className="rounded-xl border border-dashed border-grid p-12 text-center text-sm text-grey-500">No pilot portfolios are active.</div>}</div>

    <section className="mt-8 rounded-xl border border-grid bg-surface-soft p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-grey-500">Measurement boundary</p><p className="mt-2 text-xs leading-5 text-grey-600">Workspace views are recorded directly. Email delivery reflects SendGrid delivery records, but email opens are not claimed because open-event ingestion is not connected. Product value is inferred only from explicit useful feedback, PM responses, and reviewed outcomes.</p></section>
  </div>;
}
