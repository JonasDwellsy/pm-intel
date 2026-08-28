import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type BuildEnvironment = Record<string, string | undefined>;

export function shouldRunMarketIqPreviewMigrations(
  environment: BuildEnvironment,
): boolean {
  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_PROJECT_PRODUCTION_URL === "market-iq-mu.vercel.app" &&
    environment.MARKET_IQ_PREVIEW_ENABLED === "1" &&
    environment.MARKET_IQ_USE_PROJECT_DATABASE === "1"
  );
}

export function runMarketIqPreviewMigrations(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (!shouldRunMarketIqPreviewMigrations(environment)) {
    console.log("Not an isolated Market IQ preview; skipping Market IQ migrations.");
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const migrationScript = "market-iq:migrate";
  const result = spawnSync(npmCommand, ["run", migrationScript], {
    stdio: "inherit",
    env: environment,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Market IQ preview ${migrationScript} failed with exit code ${result.status}.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMarketIqPreviewMigrations();
}
