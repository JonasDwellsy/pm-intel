import type { Metadata } from "next";
import Link from "next/link";
import {
  seedClevelandPilotPortfolio,
  refreshPortfolioWatch,
  updateActivationTaskStatus,
  updateAssetReadiness,
  updateOnboardingRequestStatus,
} from "./actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Portfolio activation",
  robots: { index: false, follow: false },
};

const READINESS_LABELS: Record<string, string> = {
  ready: "Ready",
  monitoring: "Monitoring",
  operator_outreach: "Operator outreach",
  dwellsy_onboarding: "Dwellsy onboarding",
  needs_confirmation: "Needs confirmation",
};

const TASK_LABELS: Record<string, string> = {
  match_review: "Match review",
  issue_uru: "URU audit",
  operator_outreach: "Operator outreach",
  comp_setup: "Comp setup",
  customer_confirmation: "Customer confirmation",
};

function badgeClass(value: string): string {
  if (value === "ready" || value === "matched" || value === "complete") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (value === "monitoring" || value === "in_progress") {
    return "bg-sky-50 text-sky-800 border-sky-200";
  }
  if (value === "blocked" || value === "operator_outreach") {
    return "bg-rose-50 text-rose-800 border-rose-200";
  }
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function easternDateTimeInput(value: Date | null): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default async function PortfolioActivationPage() {
  const [organizations, portfolios, onboardingRequests] = await Promise.all([
    prisma.organization.findMany({
      select: { id: true, name: true, personalForUserId: true },
      orderBy: [{ personalForUserId: "asc" }, { name: "asc" }],
    }),
    prisma.portfolioIqPortfolio.findMany({
      include: {
        organization: { select: { name: true } },
        assets: {
          include: {
            buildings: { orderBy: [{ isPrimary: "desc" }, { canonicalAddress: "asc" }] },
            activationTasks: { orderBy: [{ status: "asc" }, { taskType: "asc" }] },
            compSet: { include: { members: { select: { reviewStatus: true } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.portfolioIqOnboardingRequest.findMany({
      include: { organization: { select: { name: true } }, properties: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <header className="mt-6 grid gap-6 rounded-xl border border-grid bg-surface-soft p-6 md:grid-cols-[1fr_340px]">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
            Assisted onboarding
          </p>
          <h1 className="text-3xl font-bold text-navy">Portfolio activation console</h1>
          <p className="mt-3 max-w-[650px] text-[14px] leading-relaxed text-grey-600">
            Internal workspace for turning a customer&apos;s property list into a monitored Portfolio IQ account.
            Customers provide what they have; activation staff resolve property matches, URU coverage, operator
            relationships, and comp readiness before the launch call.
          </p>
        </div>
        <form action={seedClevelandPilotPortfolio} className="rounded-lg border border-grid bg-white p-4">
          <label htmlFor="organizationId" className="block text-[12px] font-semibold uppercase tracking-wider text-grey-600">
            Load Cleveland pilot into
          </label>
          <select
            id="organizationId"
            name="organizationId"
            required
            defaultValue=""
            className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy"
          >
            <option value="" disabled>Choose an organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}{organization.personalForUserId ? " (personal)" : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="mt-3 w-full rounded-md bg-navy px-4 py-2 text-[14px] font-semibold text-white hover:bg-navy/90"
          >
            Load synthetic pilot
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-grey-500">
            Idempotent. Re-running preserves completed work and does not touch Operator IQ records.
          </p>
        </form>
      </header>

      {onboardingRequests.length > 0 && (
        <section className="mt-8 rounded-xl border border-teal/25 bg-teal-soft p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Concierge intake</p><h2 className="text-2xl font-bold text-navy">Customer onboarding requests</h2></div><p className="text-[12px] text-grey-600">Schedule the call, then move the request into activation.</p></div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {onboardingRequests.map((request) => (
              <article key={request.id} className="rounded-lg border border-grid bg-white p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-navy">{request.organization.name}</p><p className="mt-1 text-[12px] text-grey-600">{request.contactName ?? "Contact pending"}{request.contactEmail ? ` · ${request.contactEmail}` : ""}</p></div><span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-800">{request.status.replaceAll("_", " ")}</span></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]"><div><dt className="text-grey-500">Preferred time</dt><dd className="mt-0.5 font-semibold text-navy">{request.preferredContactWindow ?? "Not supplied"} · {request.timezone ?? "Timezone pending"}</dd></div><div><dt className="text-grey-500">Properties supplied</dt><dd className="mt-0.5 font-semibold text-navy">{request.properties.length}</dd></div></dl>
                {request.intakeNotes && <p className="mt-3 rounded-md bg-surface-soft px-3 py-2 text-[12px] leading-relaxed text-grey-600">{request.intakeNotes}</p>}
                {request.properties.length > 0 && <details className="mt-3 text-[12px]"><summary className="cursor-pointer font-semibold text-teal-700">Review supplied properties</summary><ul className="mt-2 space-y-1 text-grey-600">{request.properties.map((property) => <li key={property.id}>{property.propertyName ? `${property.propertyName} · ` : ""}{property.addressLine}</li>)}</ul></details>}
                <Link href={`/admin/portfolio-activation/intake/${request.id}`} className="mt-4 flex items-center justify-between rounded-md border border-teal/30 bg-teal-soft px-3 py-2 text-[12px] font-semibold text-teal-800"><span>Open intake workbench</span><span>{request.properties.filter((property) => property.status === "activated").length}/{request.properties.length} activated →</span></Link>
                <form action={updateOnboardingRequestStatus} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="requestId" value={request.id} />
                  <select name="status" defaultValue={request.status} className="rounded-md border border-grid px-2 py-2 text-[12px] text-navy"><option value="call_requested">Call requested</option><option value="scheduled">Scheduled</option><option value="activating">Activating</option><option value="launch_ready">Launch ready</option><option value="complete">Complete</option></select>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-grey-500">Session time (ET)<input type="datetime-local" name="scheduledFor" defaultValue={easternDateTimeInput(request.scheduledFor)} className="mt-1 w-full rounded-md border border-grid px-2 py-2 text-[12px] font-normal normal-case tracking-normal text-navy" /></label>
                  <button className="rounded-md bg-navy px-3 py-2 text-[12px] font-semibold text-white">Save</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      {portfolios.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-grid px-6 py-14 text-center">
          <h2 className="text-xl font-semibold text-navy">No portfolios are in activation yet</h2>
          <p className="mt-2 text-[14px] text-grey-600">Choose an organization above to load the Cleveland working portfolio.</p>
        </div>
      ) : (
        portfolios.map((portfolio) => {
          const tasks = portfolio.assets.flatMap((asset) =>
            asset.activationTasks.map((task) => ({ ...task, assetName: asset.name }))
          );
          const openTasks = tasks.filter((task) => task.status !== "complete");
          const buildingCount = portfolio.assets.reduce((sum, asset) => sum + asset.buildings.length, 0);
          const matchedCount = portfolio.assets.filter((asset) => asset.matchStatus === "matched").length;
          const mfCount = portfolio.assets.filter((asset) => asset.assetType === "multifamily").length;
          const sfrCount = portfolio.assets.length - mfCount;
          const lockedCompCount = portfolio.assets.filter((asset) => asset.compSet?.status === "locked").length;

          return (
            <section key={portfolio.id} className="mt-8 overflow-hidden rounded-xl border border-grid bg-white">
              <div className="border-b border-grid px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-navy">{portfolio.name}</h2>
                      {portfolio.isSynthetic && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                          Synthetic
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-grey-600">
                      {portfolio.organization.name} · {portfolio.marketId} · Assisted activation
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-800">
                    {portfolio.status}
                  </span>
                  <form action={refreshPortfolioWatch}>
                    <input type="hidden" name="portfolioId" value={portfolio.id} />
                    <button className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">Refresh Portfolio Watch</button>
                  </form>
                </div>
              </div>

              <div className="grid border-b border-grid sm:grid-cols-2 lg:grid-cols-6">
                {[
                  ["Assets", portfolio.assets.length],
                  ["Physical buildings", buildingCount],
                  ["Matched", `${matchedCount}/${portfolio.assets.length}`],
                  ["Product mix", `${mfCount} MF · ${sfrCount} SFR`],
                  ["Comp sets locked", `${lockedCompCount}/${portfolio.assets.length}`],
                  ["Open activation tasks", openTasks.length],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-grid px-5 py-4 last:border-b-0 sm:border-r lg:border-b-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-grey-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-navy">{value}</p>
                  </div>
                ))}
              </div>

              <div className="px-6 py-6">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-semibold text-navy">Property match review</h3>
                  <p className="text-[12px] text-grey-500">Observed operators are context, not contract verification.</p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-grid">
                  <table className="w-full min-w-[980px] border-collapse text-[13px]">
                    <thead className="bg-surface-soft text-left text-[10px] uppercase tracking-wider text-grey-600">
                      <tr>
                        <th className="px-3 py-3">Asset</th>
                        <th className="px-3 py-3">Product</th>
                        <th className="px-3 py-3">Dwellsy match</th>
                        <th className="px-3 py-3">Operator observed</th>
                        <th className="px-3 py-3">Buildings</th>
                        <th className="px-3 py-3">URU</th>
                        <th className="px-3 py-3">Comp review</th>
                        <th className="px-3 py-3">Readiness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.assets.map((asset) => (
                        <tr key={asset.id} className="border-t border-grid align-top">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-navy">{asset.name}</p>
                            <p className="mt-0.5 text-[11px] text-grey-500">
                              {asset.canonicalAddress}, {asset.city} {asset.postalCode}
                            </p>
                            {asset.sourceNote && <p className="mt-1 max-w-[300px] text-[11px] leading-snug text-grey-500">{asset.sourceNote}</p>}
                          </td>
                          <td className="px-3 py-3 text-grey-600">{asset.assetType === "single_family" ? "SFR" : "Multifamily"}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(asset.matchStatus)}`}>
                              {asset.matchStatus === "matched" ? "Matched" : "Review"}
                            </span>
                            <p className="mt-1 font-mono text-[10px] text-grey-500">{asset.dwellsyCommunityId ?? "No community ID"}</p>
                          </td>
                          <td className="px-3 py-3 text-navy">{asset.observedOperatorName ?? "Unknown"}</td>
                          <td className="px-3 py-3">
                            <p className="font-semibold tabular-nums text-navy">{asset.buildings.length}</p>
                            {asset.buildings.length > 1 && (
                              <details className="mt-1 text-[11px] text-grey-500">
                                <summary className="cursor-pointer">Show addresses</summary>
                                <ul className="mt-1 space-y-0.5">
                                  {asset.buildings.map((building) => <li key={building.id}>{building.canonicalAddress}</li>)}
                                </ul>
                              </details>
                            )}
                          </td>
                          <td className="px-3 py-3 capitalize text-grey-600">{asset.uruStatus.replaceAll("_", " ")}</td>
                          <td className="px-3 py-3">
                            {asset.compSet ? (
                              <div>
                                <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(asset.compSet.status === "locked" ? "ready" : "needs_confirmation")}`}>
                                  {asset.compSet.status === "locked" ? "Locked" : "Review"}
                                </span>
                                <p className="mt-1 text-[10px] text-grey-500">
                                  {asset.compSet.members.filter((member) => member.reviewStatus === "included").length} approved · {asset.compSet.members.filter((member) => member.reviewStatus === "proposed").length} proposed
                                </p>
                                <Link href={`/admin/portfolio-activation/${asset.id}`} className="mt-1 inline-flex text-[11px] font-semibold text-teal-700 hover:underline">
                                  Review comps →
                                </Link>
                              </div>
                            ) : (
                              <span className="text-[11px] text-grey-500">Not generated</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <form action={updateAssetReadiness} className="flex items-center gap-2">
                              <input type="hidden" name="assetId" value={asset.id} />
                              <select
                                name="readinessStatus"
                                defaultValue={asset.readinessStatus}
                                className="rounded border border-grid bg-white px-2 py-1.5 text-[11px] text-navy"
                              >
                                {Object.entries(READINESS_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                              <button type="submit" className="rounded bg-navy px-2 py-1.5 text-[10px] font-semibold text-white">Save</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-grid bg-surface-soft px-6 py-6">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-semibold text-navy">Activation work queue</h3>
                  <p className="text-[12px] text-grey-500">{tasks.length - openTasks.length} complete · {openTasks.length} remaining</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {openTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-grid bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">{TASK_LABELS[task.taskType] ?? task.taskType}</p>
                          <p className="mt-1 font-semibold text-navy">{task.assetName}</p>
                          {task.note && <p className="mt-1 text-[12px] leading-relaxed text-grey-600">{task.note}</p>}
                        </div>
                        <form action={updateActivationTaskStatus}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="status" value="complete" />
                          <button type="submit" className="whitespace-nowrap rounded-md border border-grid px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-surface-soft">
                            Mark complete
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
                {openTasks.length === 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-6 text-center text-[14px] font-semibold text-emerald-800">
                    Activation queue complete. This portfolio is ready for the customer launch review.
                  </div>
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
