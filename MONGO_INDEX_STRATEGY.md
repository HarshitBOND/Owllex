# Mongo Index Review & Initialization Strategy

Last updated: March 15, 2026

## Goal

Provide a repeatable process to validate and maintain critical MongoDB indexes for performance and reliability.

## Critical Collections

- `users`
- `cases`
- `clients`
- `tasks`
- `simpleinvoices`
- `notifications`
- `transactions`
- `scraped_cases`
- `downloaded_pdfs`
- `scraper_logs`
- `firms`
- `teammemberships`
- `jobruns`

## What was added

- Additional indexes on high-traffic query paths (cases, clients, tasks, invoices, downloaded PDFs).
- New team/RBAC and job observability collections with indexes.
- Optional startup index sync strategy in `connectMongo.ts` behind `MONGO_SYNC_INDEXES=true`.

## Safe Index Workflow

1. Audit existing indexes:
   - `npm run audit:indexes`
2. Compare against expected query patterns and model definitions.
3. Enable controlled sync only during maintenance windows:
   - Set `MONGO_SYNC_INDEXES=true`
   - Restart app once
4. Disable sync flag after migration (to avoid repeated expensive sync operations).
5. Re-run `npm run audit:indexes` and archive output.

## Why this strategy

- Keeps normal runtime lightweight (no forced index sync every boot).
- Supports deterministic, operator-controlled index rollouts.
- Aligns with production-safe migration practices.

## Notes

- `syncIndexes` can drop stale indexes if model definitions changed.
- Always review index impact on large collections before enabling in production.
