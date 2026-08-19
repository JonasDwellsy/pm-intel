import type { VercelConfig } from "@vercel/config/v1";

type CronConfig = NonNullable<VercelConfig["crons"]>;

export const MARKET_IQ_VERCEL_PROJECT_ID =
  "prj_mjxJhnNhVUnwzGwhJq0rTM13KCG0";

export const SHARED_PLATFORM_CRONS: CronConfig = [
  { path: "/api/cron/watch-list-digest", schedule: "0 13 * * *" },
  { path: "/api/cron/brief-digest", schedule: "0 14 * * *" },
  { path: "/api/cron/portfolio-iq-monitoring", schedule: "45 14 * * 1" },
  { path: "/api/cron/market-iq-editions", schedule: "30 12 * * *" },
  {
    path: "/api/cron/market-iq-internal-briefing",
    schedule: "0 16 * * 1",
  },
  {
    path: "/api/cron/portfolio-iq-pm-reminders",
    schedule: "30 15 * * 1-5",
  },
  { path: "/api/cron/portfolio-iq-digest", schedule: "0 15 * * *" },
];

export const MARKET_IQ_CRONS: CronConfig = [
  { path: "/api/cron/market-iq-editions", schedule: "30 12 * * *" },
  {
    path: "/api/cron/market-iq-internal-briefing",
    schedule: "0 16 * * 1",
  },
];

export function assertMarketIqCronBoundary(crons: CronConfig): void {
  const unrelatedCron = crons.find(
    ({ path }) => !path.startsWith("/api/cron/market-iq-")
  );
  if (unrelatedCron) {
    throw new Error(
      `The Market IQ Vercel project cannot schedule unrelated route ${unrelatedCron.path}`
    );
  }
}

export function cronsForProject(
  projectId = process.env.VERCEL_PROJECT_ID
): CronConfig {
  if (projectId === MARKET_IQ_VERCEL_PROJECT_ID) {
    assertMarketIqCronBoundary(MARKET_IQ_CRONS);
    return MARKET_IQ_CRONS;
  }
  return SHARED_PLATFORM_CRONS;
}

export const config: VercelConfig = {
  crons: cronsForProject(),
};
