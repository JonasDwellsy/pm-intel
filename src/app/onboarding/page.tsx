import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadPortfolioOnboarding } from "@/lib/portfolio-iq/onboarding.server";
import { onboardingStatusLabel } from "@/lib/portfolio-iq/onboarding";
import { requestOnboardingSession, submitPortfolioIntake } from "./actions";
import { isAdminUser } from "@/lib/auth/is-admin";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null | undefined): string {
  if (!value) return "Not scheduled";
  return value.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default async function OnboardingPage() {
  if (!portfolioIqPreviewEnabled()) notFound();
  if (!(await viewerHasProductAccess("portfolio_iq"))) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const { portfolio, request } = await loadPortfolioOnboarding({ userId, organizationId });
  const assets = portfolio?.assets ?? [];
  const tasks = assets.flatMap((asset) => asset.activationTasks);
  const matched = assets.filter((asset) => asset.matchStatus === "matched").length;
  const compReady = assets.filter((asset) => asset.compSet?.status === "locked").length;
  const listingReady = assets.filter((asset) => ["observed", "partial"].includes(asset.uruStatus)).length;
  const monitoring = assets.filter((asset) => ["monitoring", "ready"].includes(asset.readinessStatus)).length;
  const suppliedProperties = request?.properties ?? [];
  const callRequested = Boolean(request?.callRequestedAt);
  const callScheduled = Boolean(request?.scheduledFor);
  const portfolioReceived = assets.length > 0 || suppliedProperties.length > 0;
  const progressSteps = [portfolioReceived, callRequested, assets.length > 0 && matched === assets.length, assets.length > 0 && listingReady === assets.length, assets.length > 0 && compReady === assets.length, assets.length > 0 && monitoring === assets.length];
  const progress = Math.round((progressSteps.filter(Boolean).length / progressSteps.length) * 100);
  const canOperateLaunch = isAdminUser(userId);

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_380px] lg:items-end">
        <div>
          <p className="dq-eyebrow">Activation Concierge</p>
          <h1 className="dq-h1">We set up the portfolio with you</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">
            Give Dwellsy the property list you already have and meet once with an onboarding specialist. We handle property matching, URU coverage, comparable review, operator confirmation, and the first owner briefing.
          </p>
          {canOperateLaunch && <Link href="/admin/portfolio-activation" className="mt-5 inline-flex rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open pilot launch console →</Link>}
        </div>
        <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5">
          <div className="flex items-center justify-between gap-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Activation status</p><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-800">{onboardingStatusLabel(request?.status)}</span></div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-navy">{progress}%</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-teal-700" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">You provide the starting information once. Dwellsy completes the activation work.</p>
        </aside>
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-xl border border-grid bg-white p-5 shadow-sm sm:p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">1</div>
          <p className="dq-eyebrow mt-5">Your only meeting</p>
          <h2 className="dq-h2">Request an onboarding session</h2>
          {callRequested ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">{callScheduled ? `Scheduled for ${dateLabel(request?.scheduledFor)}` : "Your request is with the onboarding team"}</p>
              <p className="mt-1 text-sm leading-6 text-emerald-900/75">{callScheduled ? "Your specialist will use the session to confirm ownership details and show you the finished workspace." : `We will contact ${request?.contactEmail} to schedule the session around your ${request?.preferredContactWindow} preference.`}</p>
            </div>
          ) : (
            <form action={requestOnboardingSession} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="portfolioId" value={portfolio?.id ?? ""} />
              <label className="text-sm font-semibold text-navy">Your name<input name="contactName" required className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-sm font-semibold text-navy">Email<input type="email" name="contactEmail" required className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-sm font-semibold text-navy">Phone, optional<input name="contactPhone" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-sm font-semibold text-navy">Best time<select name="preferredContactWindow" required defaultValue="flexible" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="flexible">Flexible</option></select></label>
              <label className="text-sm font-semibold text-navy">Timezone<input name="timezone" required defaultValue="Eastern Time" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-sm font-semibold text-navy">Anything we should know?<input name="intakeNotes" placeholder="Optional" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
              <button className="sm:col-span-2 rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Request my onboarding session</button>
            </form>
          )}
        </article>

        <article className="rounded-xl border border-grid bg-white p-5 shadow-sm sm:p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">2</div>
          <p className="dq-eyebrow mt-5">Send what you have</p>
          <h2 className="dq-h2">Provide the property list</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Paste one address per line or upload the spreadsheet you already use. Missing unit counts, PM names, or exact formatting will not block onboarding.</p>
          <form action={submitPortfolioIntake} className="mt-5 space-y-4">
            <input type="hidden" name="portfolioId" value={portfolio?.id ?? ""} />
            <label className="block text-sm font-semibold text-navy">Property addresses<textarea name="propertyLines" rows={5} placeholder={"21480 Sheldon Rd, Brook Park, OH 44142\n398 W Bagley Rd, Berea, OH 44017"} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal leading-6" /></label>
            <label className="block text-sm font-semibold text-navy">Or upload a file<input type="file" name="propertyFile" accept=".csv,.xlsx,.xls" className="mt-2 block w-full rounded-md border border-dashed border-grid bg-surface-soft px-3 py-3 text-sm font-normal" /></label>
            <button className="w-full rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft">Send properties to Dwellsy</button>
          </form>
          {(assets.length > 0 || suppliedProperties.length > 0) && <p className="mt-4 rounded-lg bg-surface-soft px-4 py-3 text-sm font-medium text-navy">We currently have {assets.length || suppliedProperties.length} properties in the activation workspace. Use this form anytime to add missing properties.</p>}
        </article>
      </section>

      <section className="mt-8 rounded-xl border border-grid bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-7 lg:grid-cols-[340px_1fr]">
          <div>
            <p className="dq-eyebrow">What happens next</p>
            <h2 className="dq-h2">Dwellsy works the activation queue</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Your specialist and activation team complete these steps. We ask you only for exceptions that require an ownership or operating decision.</p>
            {tasks.length > 0 && <p className="mt-4 text-xs leading-5 text-muted-foreground">{tasks.filter((task) => task.status === "complete").length} of {tasks.length} internal activation tasks are complete.</p>}
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Portfolio received", portfolioReceived, `${assets.length || suppliedProperties.length} properties supplied`],
              ["Session requested", callRequested, callScheduled ? "Scheduled" : callRequested ? "Scheduling in progress" : "One request form"],
              ["Property identity", assets.length > 0 && matched === assets.length, assets.length ? `${matched} of ${assets.length} confirmed` : "Begins after intake"],
              ["Dwellsy listing coverage", assets.length > 0 && listingReady === assets.length, assets.length ? `${listingReady} of ${assets.length} covered` : "URU audit follows matching"],
              ["Comparable review", assets.length > 0 && compReady === assets.length, assets.length ? `${compReady} of ${assets.length} locked` : "Built by Dwellsy"],
              ["Owner workspace launch", assets.length > 0 && monitoring === assets.length, assets.length ? `${monitoring} of ${assets.length} monitoring` : "First briefing included"],
            ].map(([label, complete, detail], index) => (
              <li key={String(label)} className={`rounded-lg border p-4 ${complete ? "border-emerald-200 bg-emerald-50" : "border-grid bg-surface-soft"}`}>
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Step {index + 1}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-emerald-600 text-white" : "border border-grid bg-white text-muted-foreground"}`}>{complete ? "✓" : ""}</span></div>
                <p className="mt-3 font-semibold text-navy">{String(label)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(detail)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {suppliedProperties.length > 0 && (
        <section className="mt-8 rounded-xl border border-grid bg-white p-5 sm:p-6">
          <p className="dq-eyebrow">Additional intake</p><h2 className="dq-h2">Properties you supplied</h2>
          <div className="mt-4 divide-y divide-grid">{suppliedProperties.map((property) => <div key={property.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-navy">{property.propertyName ?? property.addressLine}</p>{property.propertyName && <p className="mt-0.5 text-xs text-muted-foreground">{property.addressLine}</p>}</div><span className="rounded-full bg-surface-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{property.status.replaceAll("_", " ")}</span></div>)}</div>
        </section>
      )}
    </main>
  );
}
