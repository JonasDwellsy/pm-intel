import { spawnSync } from "node:child_process";
import path from "node:path";

const pooled = process.env.MARKET_IQ_DATABASE_URL;
const direct = process.env.MARKET_IQ_DATABASE_URL_UNPOOLED;
const marketIqEnabled = process.env.MARKET_IQ_PREVIEW_ENABLED === "1";

if (!pooled && !direct && !marketIqEnabled) {
  console.log("Market IQ database is not configured; skipping its migrations.");
  process.exit(0);
}

if (!pooled || !direct) {
  throw new Error(
    "MARKET_IQ_DATABASE_URL and MARKET_IQ_DATABASE_URL_UNPOOLED must be configured together."
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
  { stdio: "inherit", env: process.env }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Market IQ migration failed with exit code ${result.status}.`);
}
