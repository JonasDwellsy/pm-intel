import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { proposeCompMembers } from "@/lib/portfolio-iq/comp-generator";
import {
  finalizeCompSet,
  reopenCompSet,
  replaceCompMember,
  updateCompMemberReview,
} from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Comp review",
  robots: { index: false, follow: false },
};

const EXCLUSION_REASONS = [
  ["wrong_property_type", "Wrong property type"],
  ["wrong_bedroom_mix", "Wrong bedroom mix"],
  ["poor_location_match", "Poor location match"],
  ["unusual_condition", "Unusual condition or positioning"],
  ["duplicate_community", "Duplicate community"],
  ["other", "Other"],
] as const;

function money(value: number | null): string {
  return value === null ? "Not reported" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function rentPerSf(rent: number | null, squareFeet: number | null): string {
  return rent && squareFeet ? `$${(rent / squareFeet).toFixed(2)}` : "Not reported";
}

function statusClass(status: string): string {
  if (status === "included" || status === "locked") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "excluded") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function CompReviewPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.portfolioIqAsset.findUnique({
    where: { id: assetId },
    include: {
      portfolio: { include: { organization: { select: { name: true } } } },
      buildings: { orderBy: [{ isPrimary: "desc" }, { canonicalAddress: "asc" }] },
      compSet: { include: { members: { orderBy: [{ reviewStatus: "asc" }, { propertyLabel: "asc" }] } } },
    },
  });
  if (!asset?.compSet) notFound();

  const propertyType = asset.assetType === "single_family" ? "house" : "apartment";
  const candidates = await prisma.marketIqListing.findMany({
    where: {
      importId: asset.compSet.sourceImportId,
      propertyType,
      address: { not: null },
      askingRent: { not: null },
      OR: [{ postalCode: asset.postalCode }, { city: { equals: asset.city, mode: "insensitive" } }],
    },
    orderBy: { activatedAt: "desc" },
    take: 1500,
    select: {
      sourceRecordId: true,
      address: true,
      communityName: true,
      city: true,
      state: true,
      postalCode: true,
      propertyType: true,
      bedrooms: true,
      bathrooms: true,
      askingRent: true,
      squareFeet: true,
      activatedAt: true,
    },
  });
  const existingKeys = new Set(asset.compSet.members.map((member) => member.comparisonKey));
  const alternatives = proposeCompMembers({
    subjectAddresses: asset.buildings.flatMap((building) => [building.suppliedAddress, building.canonicalAddress]),
    city: asset.city,
    postalCode: asset.postalCode,
    candidates,
    limit: 25,
  }).filter((candidate) => !existingKeys.has(candidate.comparisonKey)).slice(0, 10);

  const activeMembers = asset.compSet.members.filter((member) => member.reviewStatus !== "excluded");
  const includedCount = asset.compSet.members.filter((member) => member.reviewStatus === "included").length;
  const proposedCount = asset.compSet.members.filter((member) => member.reviewStatus === "proposed").length;
  const excludedCount = asset.compSet.members.filter((member) => member.reviewStatus === "excluded").length;
  const progress = asset.compSet.status === "locked" ? 100 : Math.round((includedCount / Math.max(activeMembers.length, 1)) * 100);

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-20">
      <header className="mt-6 border-b border-grid pb-6">
        <Link href="/admin/portfolio-activation" className="text-sm font-semibold text-teal-700 hover:underline">
          ← Portfolio activation
        </Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Assisted comp review</p>
            <h1 className="mt-2 text-3xl font-bold text-navy">{asset.name}</h1>
            <p className="mt-2 text-sm text-grey-600">
              {asset.canonicalAddress}, {asset.city}, {asset.state} {asset.postalCode} · {asset.assetType === "single_family" ? "Single-family" : "Multifamily"}
            </p>
            <p className="mt-1 text-xs text-grey-500">{asset.portfolio.organization.name} · {asset.portfolio.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusClass(asset.compSet.status)}`}>
              {asset.compSet.status}
            </span>
            <Link href={`/portfolio-iq/properties/${asset.slug}`} className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">
              View customer page
            </Link>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-grid bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-grey-500">Review progress</p>
              <p className="mt-1 text-lg font-semibold text-navy">{includedCount} approved · {proposedCount} awaiting decision · {excludedCount} excluded</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-navy">{progress}%</p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full rounded-full bg-teal-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-xs leading-5 text-grey-500">
            Locking converts every remaining proposed member to approved, completes the comp-setup task, and makes the curated set the customer-facing comparison set.
          </p>
        </div>
        <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Quality gate</p>
          <p className="mt-2 text-sm leading-6 text-navy">At least three included properties are required. Review location, product type, bedroom mix, and unusual positioning before locking.</p>
          {asset.compSet.status === "locked" ? (
            <form action={reopenCompSet} className="mt-4">
              <input type="hidden" name="compSetId" value={asset.compSet.id} />
              <button className="w-full rounded-md border border-navy bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-surface-soft">Reopen review</button>
            </form>
          ) : (
            <form action={finalizeCompSet} className="mt-4">
              <input type="hidden" name="compSetId" value={asset.compSet.id} />
              <button disabled={activeMembers.length < 3} className="w-full rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Approve and lock set</button>
            </form>
          )}
        </aside>
      </section>

      <section className="mt-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Current set</p>
          <h2 className="mt-1 text-2xl font-bold text-navy">Review each proposed comparable</h2>
        </div>
        <div className="mt-4 space-y-3">
          {asset.compSet.members.map((member) => (
            <article key={member.id} className={`rounded-xl border p-5 ${member.reviewStatus === "excluded" ? "border-rose-200 bg-rose-50/40" : "border-grid bg-white"}`}>
              <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-navy">{member.propertyLabel}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass(member.reviewStatus)}`}>{member.reviewStatus}</span>
                    <span className="rounded-full border border-grid bg-surface-soft px-2 py-0.5 text-[10px] font-semibold text-grey-600">{member.selectionReason}</span>
                  </div>
                  <p className="mt-1 text-sm text-grey-600">{member.address}{member.city ? `, ${member.city}` : ""}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      ["Beds", member.bedrooms?.toFixed(member.bedrooms % 1 ? 1 : 0) ?? "Unknown"],
                      ["Asking rent", money(member.askingRent)],
                      ["Square feet", member.squareFeet?.toLocaleString("en-US") ?? "Unknown"],
                      ["Rent / sf", rentPerSf(member.askingRent, member.squareFeet)],
                      ["Activated", member.activatedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? "Unknown"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-grey-500">{label}</dt>
                        <dd className="mt-1 text-sm font-semibold text-navy">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {member.reviewNote && <p className="mt-3 text-xs italic text-grey-500">Review note: {member.reviewNote}</p>}
                </div>
                {asset.compSet?.status !== "locked" && (
                  <div className="rounded-lg border border-grid bg-surface-soft p-4">
                    <form action={updateCompMemberReview} className="space-y-3">
                      <input type="hidden" name="memberId" value={member.id} />
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-grey-600" htmlFor={`reason-${member.id}`}>Exclusion reason</label>
                      <select id={`reason-${member.id}`} name="exclusionReason" defaultValue={member.exclusionReason ?? "poor_location_match"} className="w-full rounded-md border border-grid bg-white px-3 py-2 text-xs text-navy">
                        {EXCLUSION_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <input name="reviewNote" defaultValue={member.reviewNote ?? ""} placeholder="Optional review note" className="w-full rounded-md border border-grid bg-white px-3 py-2 text-xs text-navy" />
                      <div className="grid grid-cols-2 gap-2">
                        <button name="reviewStatus" value="included" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Approve</button>
                        <button name="reviewStatus" value="excluded" className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800">Exclude</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {asset.compSet.status !== "locked" && (
        <section className="mt-10 border-t border-grid pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Replacement candidates</p>
          <h2 className="mt-1 text-2xl font-bold text-navy">Nearby alternatives from the same source snapshot</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-grey-600">Replacing a member preserves the excluded record and its audit history. The replacement is immediately marked included, but the set remains unlocked until final review.</p>
          <div className="mt-4 overflow-hidden rounded-xl border border-grid bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-surface-soft text-[10px] uppercase tracking-wider text-grey-600">
                  <tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Why</th><th className="px-4 py-3">Beds</th><th className="px-4 py-3">Rent</th><th className="px-4 py-3">Rent / sf</th><th className="px-4 py-3">Replace</th></tr>
                </thead>
                <tbody className="divide-y divide-grid">
                  {alternatives.map((candidate) => (
                    <tr key={candidate.sourceRecordId}>
                      <td className="px-4 py-3"><p className="font-semibold text-navy">{candidate.propertyLabel}</p><p className="mt-0.5 text-xs text-grey-500">{candidate.address}</p></td>
                      <td className="px-4 py-3 text-grey-600">{candidate.selectionReason}</td>
                      <td className="px-4 py-3 text-navy">{candidate.bedrooms ?? "Unknown"}</td>
                      <td className="px-4 py-3 font-semibold text-navy">{money(candidate.askingRent)}</td>
                      <td className="px-4 py-3 text-navy">{rentPerSf(candidate.askingRent, candidate.squareFeet)}</td>
                      <td className="px-4 py-3">
                        <form action={replaceCompMember} className="flex gap-2">
                          <input type="hidden" name="sourceRecordId" value={candidate.sourceRecordId} />
                          <select name="memberId" required defaultValue="" className="max-w-[170px] rounded-md border border-grid bg-white px-2 py-1.5 text-xs text-navy">
                            <option value="" disabled>Choose current comp</option>
                            {activeMembers.map((member) => <option key={member.id} value={member.id}>{member.propertyLabel}</option>)}
                          </select>
                          <button className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white">Replace</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
