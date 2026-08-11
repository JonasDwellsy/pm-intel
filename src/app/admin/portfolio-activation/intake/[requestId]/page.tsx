import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { onboardingStatusLabel } from "@/lib/portfolio-iq/onboarding";
import {
  connectOnboardingPortfolio,
  promoteOnboardingProperty,
  reviewOnboardingProperty,
} from "../../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Intake workbench",
  robots: { index: false, follow: false },
};

function statusClass(status: string): string {
  if (status === "activated") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "reviewed") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "needs_customer") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function IntakeWorkbenchPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const request = await prisma.portfolioIqOnboardingRequest.findUnique({
    where: { id: requestId },
    include: {
      organization: { select: { name: true } },
      properties: { include: { activatedAsset: { select: { slug: true, name: true } } }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!request) notFound();

  const portfolios = await prisma.portfolioIqPortfolio.findMany({
    where: { organizationId: request.organizationId },
    include: { assets: { select: { id: true, name: true, slug: true }, orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  const portfolio = portfolios.find((item) => item.id === request.portfolioId) ?? null;
  const received = request.properties.filter((property) => property.status === "received").length;
  const reviewed = request.properties.filter((property) => property.status === "reviewed").length;
  const exceptions = request.properties.filter((property) => property.status === "needs_customer").length;
  const activated = request.properties.filter((property) => property.status === "activated").length;

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-20">
      <header className="mt-6 border-b border-grid pb-6">
        <Link href="/admin/portfolio-activation" className="text-sm font-semibold text-teal-700 hover:underline">← Portfolio activation</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Intake-to-portfolio workbench</p>
            <h1 className="mt-1 text-3xl font-bold text-navy">{request.organization.name}</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-grey-600">Clean the customer&apos;s list, resolve the property identity, then promote each approved row into Portfolio IQ. Original input remains visible throughout the review.</p>
          </div>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-800">{onboardingStatusLabel(request.status)}</span>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        {[["Needs review", received], ["Ready to promote", reviewed], ["Customer exception", exceptions], ["Activated", activated]].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-grid bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-grey-500">{label}</p><p className="mt-1 text-2xl font-bold text-navy">{value}</p></div>
        ))}
      </section>

      <section className="mt-6 rounded-xl border border-grid bg-surface-soft p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_420px] md:items-end">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Activation destination</p><h2 className="mt-1 text-xl font-semibold text-navy">{portfolio?.name ?? "Connect a Portfolio IQ workspace"}</h2><p className="mt-1 text-[13px] text-grey-600">Every promoted property lands only in this organization&apos;s selected portfolio.</p></div>
          <form action={connectOnboardingPortfolio} className="flex gap-2">
            <input type="hidden" name="requestId" value={request.id} />
            <select name="portfolioId" required defaultValue={portfolio?.id ?? ""} className="min-w-0 flex-1 rounded-md border border-grid bg-white px-3 py-2 text-sm text-navy"><option value="" disabled>Choose portfolio</option>{portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">Connect</button>
          </form>
        </div>
      </section>

      {request.properties.length === 0 ? (
        <section className="mt-8 rounded-xl border border-dashed border-grid px-6 py-14 text-center"><h2 className="text-xl font-semibold text-navy">No property rows have been submitted</h2><p className="mt-2 text-sm text-grey-600">The customer can add addresses or upload a spreadsheet from the Setup page.</p></section>
      ) : (
        <section className="mt-8 space-y-5">
          {request.properties.map((property, index) => {
            const activatedAsset = property.activatedAsset;
            const defaultMode = property.promotionMode ?? "new_asset";
            return (
              <article key={property.id} className="overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-grid bg-surface-soft px-5 py-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-wider text-grey-500">Intake row {index + 1} · {property.sourceKind}</p><h2 className="mt-1 text-lg font-semibold text-navy">{property.propertyName || property.addressLine}</h2><p className="mt-1 text-[12px] text-grey-600">Original input: {property.addressLine}</p></div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusClass(property.status)}`}>{property.status.replaceAll("_", " ")}</span>
                </div>

                {property.status === "activated" && activatedAsset ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5"><div><p className="font-semibold text-emerald-900">Promoted to {activatedAsset.name}</p><p className="mt-1 text-sm text-grey-600">The asset and its activation tasks are now in Portfolio IQ.</p></div><Link href={`/portfolio-iq/properties/${activatedAsset.slug}`} className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy">Open property →</Link></div>
                ) : (
                  <form action={reviewOnboardingProperty} className="p-5">
                    <input type="hidden" name="propertyId" value={property.id} /><input type="hidden" name="requestId" value={request.id} />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs font-semibold text-navy sm:col-span-2">Property name<input name="propertyName" defaultValue={property.propertyName ?? ""} placeholder="Optional for SFR" className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy">Product<select name="assetType" defaultValue={property.assetType === "single_family" || property.assetType?.toLowerCase().includes("single") ? "single_family" : "multifamily"} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"><option value="multifamily">Multifamily</option><option value="single_family">Single-family rental</option></select></label>
                      <label className="text-xs font-semibold text-navy">Units<input type="number" min="1" max="100000" name="unitCount" defaultValue={property.unitCount ?? ""} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy sm:col-span-2">Supplied address<input name="addressLine" required defaultValue={property.addressLine} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy sm:col-span-2">Canonical address<input name="canonicalAddress" required defaultValue={property.canonicalAddress ?? property.addressLine} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy">City<input name="city" required defaultValue={property.city ?? ""} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy">State<input name="state" required maxLength={2} defaultValue={property.state ?? "OH"} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal uppercase" /></label>
                      <label className="text-xs font-semibold text-navy">ZIP<input name="postalCode" required defaultValue={property.postalCode ?? ""} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy">Match confidence<select name="matchConfidence" defaultValue={property.matchConfidence ?? ""} className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal"><option value="">Not assessed</option><option value="0.95">High</option><option value="0.75">Medium</option><option value="0.5">Low</option></select></label>
                      <label className="text-xs font-semibold text-navy sm:col-span-2">Dwellsy community or listing reference<input name="dwellsyCommunityId" defaultValue={property.dwellsyCommunityId ?? ""} placeholder="Leave blank when not yet resolved" className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                      <label className="text-xs font-semibold text-navy sm:col-span-2">Observed property manager<input name="observedOperatorName" defaultValue={property.observedOperatorName ?? ""} placeholder="Observed context, not contract verification" className="mt-1.5 w-full rounded-md border border-grid px-3 py-2 text-sm font-normal" /></label>
                    </div>

                    <div className="mt-5 grid gap-4 rounded-lg border border-grid bg-surface-soft p-4 md:grid-cols-2">
                      <label className="text-xs font-semibold text-navy">Promotion treatment<select name="promotionMode" defaultValue={defaultMode} className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal"><option value="new_asset">Create a new portfolio asset</option><option value="existing_asset">Add as a building to an existing asset</option></select></label>
                      <label className="text-xs font-semibold text-navy">Existing asset, when applicable<select name="targetAssetId" defaultValue={property.targetAssetId ?? ""} className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal"><option value="">Not applicable</option>{portfolio?.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
                      <label className="text-xs font-semibold text-navy md:col-span-2">Activation note<textarea name="reviewNote" rows={2} defaultValue={property.reviewNote ?? ""} placeholder="Document aliases, ambiguity, owner questions, or matching rationale." className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal" /></label>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-xl text-xs leading-relaxed text-grey-500">Approve rows only when the address and promotion treatment are clear. A Dwellsy reference may remain blank and will create a match-review task.</p>
                      <div className="flex flex-wrap gap-2"><button name="outcome" value="needs_customer" className="rounded-md border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800">Needs customer answer</button><button name="outcome" value="reviewed" className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">Approve review</button></div>
                    </div>
                  </form>
                )}

                {property.status === "reviewed" && (
                  <form action={promoteOnboardingProperty} className="flex flex-wrap items-center justify-between gap-4 border-t border-emerald-200 bg-emerald-50 px-5 py-4"><input type="hidden" name="propertyId" value={property.id} /><div><p className="text-sm font-semibold text-emerald-900">Ready for Portfolio IQ</p><p className="mt-0.5 text-xs text-emerald-800">Promotion creates the asset or building and the remaining match, URU, operator, comp, and confirmation tasks.</p></div><button disabled={!portfolio} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Promote to portfolio</button></form>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
