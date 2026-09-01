/**
 * Server-side release gate for the Client Advisory consumer report funnel.
 * Missing or unexpected values fail closed so unfinished advisory surfaces
 * cannot become public because of an environment configuration mistake.
 */
export function clientAdvisoryEnabled(
  value = process.env.CLIENT_ADVISORY_ENABLED
): boolean {
  return value === "1";
}
