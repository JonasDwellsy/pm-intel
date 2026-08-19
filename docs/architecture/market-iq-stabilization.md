# Market IQ stabilization boundary

Market IQ has four canonical customer destinations: Home at `/market-iq`, Market Intelligence at `/market-iq/market`, Client Reporting at `/market-iq/client-reporting`, and Account at `/market-iq/account`. Briefing, reports, recipients, delivery, and performance are subordinate workflow routes. They may remain reachable for compatibility, but they should not become separate top-level products or navigation systems.

Application deployments are non-mutating. `npm run vercel-build` generates both Prisma clients and compiles the application, but it does not migrate a database, seed data, or run data exports. Database changes are a separate release operation through `npm run db:migrate`; local seeding and correction exports also have explicit commands.

The application still contains a documented set of direct imports from the original Cleveland pilot fixture. A regression test records that baseline so new Cleveland coupling cannot spread unnoticed. Existing imports should be removed incrementally as multi-market services replace the pilot-specific modules.

The next stabilization steps are to extract those current multi-market services, separate Market IQ scheduled work from the shared Vercel cron configuration, and add browser-level tests for sign-in, Market Intelligence, Client Reporting, and market switching.
