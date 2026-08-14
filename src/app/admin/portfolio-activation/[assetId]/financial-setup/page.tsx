import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { saveFinancialSetup } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Financial setup", robots: { index: false, follow: false } };

const SOURCE_OPTIONS = [
  ["owner_interview", "Owner interview"], ["owner_file", "Owner file"], ["pm_confirmed", "PM confirmed"], ["system_default", "System default"],
] as const;
const REVIEW_OPTIONS = [["draft", "Draft"], ["needs_owner", "Needs owner"], ["needs_pm", "Needs PM"], ["verified", "Verified"]] as const;

function labelForBedrooms(bedrooms: number): string { return bedrooms === -1 ? "Property total" : bedrooms === 0 ? "Studios" : `${bedrooms}-bedroom`; }
function dateInput(value: Date | null | undefined): string { return value?.toISOString().slice(0, 10) ?? ""; }

export default async function FinancialSetupWorkbench({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.portfolioIqAsset.findUnique({
    where: { id: assetId },
    include: { portfolio: { include: { organization: { select: { name: true } } } }, buildings: true, financialAssumptions: { orderBy: { bedrooms: "asc" } } },
  });
  if (!asset) notFound();
  const sourceImport = await marketIqPrisma.marketIqDataImport.findFirst({ where: { marketId: asset.portfolio.marketId, sourceKind: "historical_export", status: "complete" }, orderBy: { importedAt: "desc" }, select: { id: true, availableThrough: true } });
  const observations = sourceImport ? await marketIqPrisma.marketIqListing.findMany({
    where: { importId: sourceImport.id, OR: asset.buildings.flatMap((building) => [{ address: { startsWith: building.canonicalAddress, mode: "insensitive" as const } }, { address: { startsWith: building.suppliedAddress, mode: "insensitive" as const } }]) },
    select: { bedrooms: true, askingRent: true },
  }) : [];
  const observed = new Map<number, { count: number; rents: number[] }>();
  for (const row of observations) if (row.bedrooms !== null && Number.isInteger(row.bedrooms)) { const key = Number(row.bedrooms); const current = observed.get(key) ?? { count: 0, rents: [] }; current.count += 1; if (row.askingRent) current.rents.push(row.askingRent); observed.set(key, current); }
  const assumptionMap = new Map(asset.financialAssumptions.map((row) => [row.bedrooms, row]));
  const segments = [-1, ...new Set([...observed.keys(), ...asset.financialAssumptions.map((row) => row.bedrooms).filter((value) => value >= 0)])].sort((a, b) => a - b);
  const propertyAssumption = assumptionMap.get(-1);
  const segmentInventory = asset.financialAssumptions.filter((row) => row.bedrooms >= 0).reduce((sum, row) => sum + (row.inventoryUnits ?? 0), 0);
  const verified = asset.financialAssumptions.filter((row) => row.reviewStatus === "verified").length;

  return <main className="mx-auto max-w-[1120px] px-6 pb-20">
    <header className="mt-6 border-b border-grid pb-7">
      <Link href="/admin/portfolio-activation" className="text-sm font-semibold text-teal-700 hover:underline">← Portfolio activation</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Assisted financial setup</p><h1 className="mt-2 text-3xl font-bold text-navy">{asset.name}</h1><p className="mt-2 text-sm text-grey-600">Verify inventory and scenario assumptions before financial prioritization is used in an owner decision.</p></div><span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${propertyAssumption?.reviewStatus === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{propertyAssumption?.reviewStatus === "verified" ? "Property total verified" : "Verification pending"}</span></div>
    </header>

    <section className="mt-6 grid gap-4 sm:grid-cols-3">
      {[["Known property units", propertyAssumption?.inventoryUnits ?? asset.unitCount ?? "Not supplied"], ["Bedroom units mapped", segmentInventory || "Not mapped"], ["Rows verified", `${verified}/${segments.length}`]].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-grid bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-grey-500">{label}</p><p className="mt-2 text-2xl font-bold text-navy">{value}</p></article>)}
    </section>
    {propertyAssumption?.inventoryUnits && segmentInventory > propertyAssumption.inventoryUnits && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">Bedroom inventory exceeds the verified property total. Reconcile the rows before launch.</div>}
    <aside className="mt-6 rounded-xl border border-teal/25 bg-teal-soft p-5 text-sm leading-6 text-navy"><strong>Evidence boundary:</strong> Listing observations help identify which bedroom segments exist. They do not reveal total units, occupancy, signed leases, or the number of units an owner can reprice. Staff must verify those assumptions with the owner or property manager.</aside>

    <section className="mt-8 space-y-5">
      {segments.map((bedrooms) => {
        const assumption = assumptionMap.get(bedrooms);
        const evidence = observed.get(bedrooms);
        const median = evidence?.rents.length ? [...evidence.rents].sort((a,b) => a-b)[Math.floor(evidence.rents.length / 2)] : null;
        return <article key={bedrooms} className="overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid bg-surface-soft px-5 py-4"><div><h2 className="text-lg font-semibold text-navy">{labelForBedrooms(bedrooms)}</h2><p className="mt-1 text-xs text-grey-500">{bedrooms === -1 ? `${asset.assetType === "single_family" ? "Single-family asset" : "Multifamily community"} · customer-controlled total` : evidence ? `${evidence.count} historical asking observations · median $${Math.round(median ?? 0).toLocaleString("en-US")}` : "No subject observations in the historical export"}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${assumption?.reviewStatus === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{assumption?.reviewStatus?.replaceAll("_", " ") ?? "Not started"}</span></div>
          <form action={saveFinancialSetup} className="grid gap-5 p-5 lg:grid-cols-12">
            <input type="hidden" name="assetId" value={asset.id}/><input type="hidden" name="bedrooms" value={bedrooms}/>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Inventory units<input name="inventoryUnits" type="number" min="1" defaultValue={assumption?.inventoryUnits ?? (bedrooms === -1 ? asset.unitCount ?? "" : "")} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Affected units<input name="affectedUnits" type="number" min="1" defaultValue={assumption?.affectedUnits ?? ""} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Conservative %<input name="conservativePercent" type="number" min="0" max="100" defaultValue={Math.round((assumption?.conservativePct ?? .25) * 100)} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Base %<input name="basePercent" type="number" min="0" max="100" defaultValue={Math.round((assumption?.realizationPct ?? .5) * 100)} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Upside %<input name="upsidePercent" type="number" min="0" max="100" defaultValue={Math.round((assumption?.upsidePct ?? .75) * 100)} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Review status<select name="reviewStatus" defaultValue={assumption?.reviewStatus ?? "draft"} className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal">{REVIEW_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy lg:col-span-3">Source type<select name="sourceKind" defaultValue={assumption?.sourceKind ?? "owner_interview"} className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal">{SOURCE_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-semibold text-navy lg:col-span-4">Source reference<input name="sourceLabel" defaultValue={assumption?.sourceLabel ?? ""} placeholder="Example: onboarding call with Jane Smith" className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-2">Effective date<input name="effectiveAt" type="date" defaultValue={dateInput(assumption?.effectiveAt)} className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <label className="text-xs font-semibold text-navy lg:col-span-3">Notes<input name="note" defaultValue={assumption?.note ?? ""} placeholder="Open questions or caveats" className="mt-2 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"/></label>
            <div className="flex items-end lg:col-span-12"><button className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white">Save setup row</button></div>
          </form>
        </article>;
      })}
    </section>
  </main>;
}
