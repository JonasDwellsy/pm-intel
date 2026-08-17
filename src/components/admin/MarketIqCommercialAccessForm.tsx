"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  endOrganizationEnterpriseMarketIq,
  provisionOrganizationMarketIq,
  type ProvisionMarketIqResult,
} from "@/app/admin/organizations/actions";

type Subscription = {
  id: string;
  source: string;
  status: string;
  planKey: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  markets: Array<{ marketId: string }>;
};

function ProvisionButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{pending ? "Provisioning…" : "Provision enterprise access"}</button>;
}

function EndButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-md border border-red-300 bg-white px-3 py-2 text-[12px] font-semibold text-red-700 disabled:opacity-50">{pending ? "Ending…" : "End enterprise access"}</button>;
}

export function MarketIqCommercialAccessForm({ orgId, markets, subscriptions }: {
  orgId: string;
  markets: Array<{ id: string; label: string }>;
  subscriptions: Subscription[];
}) {
  const [provisionState, provisionAction] = useActionState<ProvisionMarketIqResult | null, FormData>(provisionOrganizationMarketIq, null);
  const [endState, endAction] = useActionState<ProvisionMarketIqResult | null, FormData>(endOrganizationEnterpriseMarketIq, null);
  const activeEnterprise = subscriptions.find((subscription) => subscription.source === "enterprise" && ["active", "trialing", "past_due"].includes(subscription.status));

  return <div className="rounded-md border border-grid bg-surface-soft p-4">
    <div className="grid gap-3 md:grid-cols-2">{subscriptions.slice(0, 4).map((subscription) => <div key={subscription.id} className="rounded-md border border-grid bg-white px-3 py-3 text-[12px] text-grey-600"><div className="flex items-center justify-between gap-3"><span className="font-semibold capitalize text-navy">{subscription.source}</span><span className="rounded-full bg-surface-soft px-2 py-1 font-semibold capitalize">{subscription.status.replace("_", " ")}</span></div><p className="mt-2 font-semibold text-navy">{subscription.planKey === "market_intelligence_monthly" ? "Market IQ Intelligence" : "Market IQ Client Advisory"}</p><p className="mt-1">{subscription.markets.map((market) => market.marketId).join(", ") || "No market attached"}</p>{subscription.cancelAtPeriodEnd && <p className="mt-1 text-orange-700">Cancels at period end</p>}</div>)}</div>

    <form action={provisionAction} className="mt-4 grid gap-3 border-t border-grid pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="orgId" value={orgId} />
      <label className="flex-1 text-[12px] font-semibold uppercase tracking-wider text-grey-600">Enterprise market<select name="marketId" required defaultValue={activeEnterprise?.markets[0]?.marketId ?? markets[0]?.id} className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] font-normal normal-case tracking-normal text-navy">{markets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}</select></label>
      <label className="flex-1 text-[12px] font-semibold uppercase tracking-wider text-grey-600">Plan<select name="planKey" required defaultValue={activeEnterprise?.planKey ?? "market_client_advisory_monthly"} className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] font-normal normal-case tracking-normal text-navy"><option value="market_intelligence_monthly">Intelligence · $79 standard</option><option value="market_client_advisory_monthly">Client Advisory · $199 standard</option></select></label>
      <ProvisionButton />
    </form>
    {provisionState && <p className={`mt-3 text-[13px] ${provisionState.ok ? "text-good" : "text-red-700"}`}>{provisionState.message ?? provisionState.error}</p>}

    {activeEnterprise && <form action={endAction} className="mt-4 flex items-center gap-3 border-t border-grid pt-4"><input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="subscriptionId" value={activeEnterprise.id} /><EndButton /><span className="text-[12px] text-grey-500">Stripe subscriptions must be managed through Stripe.</span></form>}
    {endState && <p className={`mt-3 text-[13px] ${endState.ok ? "text-good" : "text-red-700"}`}>{endState.message ?? endState.error}</p>}
  </div>;
}
