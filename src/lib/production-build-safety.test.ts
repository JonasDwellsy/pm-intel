import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageJson = {
  scripts: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as PackageJson;
const releaseRunbook = readFileSync(
  new URL("../../scripts/data-pipeline/MONTHLY_REFRESH.md", import.meta.url),
  "utf8"
);

test("Vercel builds compile without mutating production data", () => {
  const build = packageJson.scripts["vercel-build"];

  assert.match(build, /prisma:generate/);
  assert.doesNotMatch(
    build,
    /migrate|seed|export_name_corrections/
  );
});

test("production database operations remain explicit operator commands", () => {
  assert.equal(
    packageJson.scripts["db:migrate:production"],
    "prisma migrate deploy"
  );
  assert.equal(packageJson.scripts["db:seed:production"], "prisma db seed");
  assert.equal(
    packageJson.scripts["data:export-name-corrections"],
    "tsx scripts/data-pipeline/export_name_corrections.ts"
  );
});

test("the release runbook requires deliberate database operations and recovery", () => {
  assert.match(releaseRunbook, /Vercel deployments are build-only/);
  assert.match(releaseRunbook, /npm run db:migrate:production/);
  assert.match(
    releaseRunbook,
    /FORCE_SEED=true npm run db:seed:production/
  );
  assert.match(releaseRunbook, /restore the pre-run recovery point/);
});
