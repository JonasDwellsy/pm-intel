# Market IQ recovery drill

This drill proves that the isolated Market IQ evidence store can be recovered without touching Dwellsy production, Operator IQ, Portfolio IQ, or the active Market IQ database. Run it quarterly and after a material database change. The verifier opens a repeatable-read, read-only PostgreSQL transaction and cannot perform a restore itself.

## Boundaries

- A human creates and removes the temporary Neon recovery branch.
- Use a purpose-scoped, read-only PostgreSQL role for both verification connections.
- Never paste connection strings into a command, issue, pull request, or agent session. Export `MARKET_IQ_RECOVERY_DATABASE_URL` locally through an approved secret channel.
- Keep the generated baseline outside the repository and delete it after the drill record is complete. The baseline contains counts and internal evidence identifiers, but no credentials or listing addresses.
- Do not point the Market IQ Vercel project at the recovery branch.
- Do not test recovery by changing or deleting data in the active database.

## Procedure

1. Choose a quiet window after the nightly Trends snapshots and daily listing-feed capture have completed. Record the UTC start time and confirm the Market IQ failure-notification workflow is healthy.
2. Set `MARKET_IQ_RECOVERY_DATABASE_URL` locally to a purpose-scoped, read-only connection for the active Market IQ evidence database.
3. Capture the exact recovery baseline into a temporary directory:

   ```sh
   npm run market-iq:verify-recovery -- capture /private/tmp/market-iq-recovery-baseline.json
   ```

4. Record the baseline's `capturedAt` value. In Neon, create a temporary recovery branch from the Market IQ database at a restore point immediately after that timestamp. Do not alter the active branch.
5. Replace the local `MARKET_IQ_RECOVERY_DATABASE_URL` value with the purpose-scoped, read-only connection for the temporary recovery branch.
6. Compare the recovered database with the captured baseline:

   ```sh
   npm run market-iq:verify-recovery -- verify /private/tmp/market-iq-recovery-baseline.json
   ```

7. A passing run must confirm the database role has no write capability, report every repository migration, find all four configured Trends markets and the Cleveland listing-feed evidence, and match exact table row counts and latest evidence anchors. Any mismatch is a failed drill. Investigate the restore point, database role, or retention configuration before attempting another recovery.
8. Record the date, restore point, Neon branch name, verifier commit, result, and operator in the infrastructure log. Never record a connection string.
9. After review, remove the temporary recovery branch through the Neon console and delete the temporary baseline file. Branch removal is a separate, human-approved destructive action.

## Failure handling

The verifier fails closed if the connection is writable, a repository migration is absent, a configured market lacks recovered evidence, a listing-feed record is incomplete, or any captured count or anchor differs. A failed drill does not authorize changes to the active database. Preserve the temporary recovery branch for diagnosis and notify the Market IQ infrastructure owner.
