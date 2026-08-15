import { spawnSync } from "node:child_process";
import path from "node:path";

const marketIqEnabled = process.env.MARKET_IQ_PREVIEW_ENABLED === "1";
const projectDatabaseFallbackAllowed =
  marketIqEnabled &&
  process.env.MARKET_IQ_USE_PROJECT_DATABASE === "1" &&
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_PROJECT_PRODUCTION_URL === "market-iq-mu.vercel.app";
const pooled = process.env.MARKET_IQ_DATABASE_URL ?? (
  projectDatabaseFallbackAllowed ? process.env.DATABASE_URL : undefined
);
const direct = process.env.MARKET_IQ_DATABASE_URL_UNPOOLED ?? (
  projectDatabaseFallbackAllowed ? process.env.DATABASE_URL_UNPOOLED : undefined
);

if (!pooled && !direct && !marketIqEnabled) {
  console.log("Market IQ database is not configured; skipping its migrations.");
  process.exit(0);
}

if (!pooled || !direct) {
  throw new Error(
    "Market IQ requires a dedicated pooled and unpooled connection. Project database fallback is allowed only for the explicitly authorized Market IQ Vercel preview."
  );
}

const prismaBinary = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);
const result = spawnSync(
  prismaBinary,
  ["migrate", "deploy", "--schema", "prisma/market-iq/schema.prisma"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MARKET_IQ_DATABASE_URL: pooled,
      MARKET_IQ_DATABASE_URL_UNPOOLED: direct,
    },
  }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Market IQ migration failed with exit code ${result.status}.`);
}
