# Market IQ data service boundary

Shared Market IQ routes load market evidence through one typed service. The route chooses a market and renders the result, while source-specific builders, persistence, refresh decisions, timeouts, and fallback behavior stay outside the page component.

The server service resolves three collaborators. An adapter knows how to build a Trends IQ report and load current listing context for one market. A repository reads and writes persisted report snapshots. The service evaluates history depth and freshness, refreshes only when required, and returns explicit issues when a source is partial, stale, or unavailable.

This boundary keeps customer-facing behavior stable while reducing route coupling. Adding a market requires a registry entry and an adapter mapping, not another conditional branch in the shared page. A source failure leaves the latest saved analysis available and labels the degraded state instead of substituting unrelated data.

Fixture tests cover complete, partial, stale, and missing source states. A stabilization guard prevents the shared Market Intelligence route from importing individual market builders or listing loaders directly.
