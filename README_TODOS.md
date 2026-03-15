# LexVert Current TODO README

This document is the current repo-accurate backlog as of March 15, 2026.

It is intended to be the working source of truth for remaining implementation work. It is more accurate than `MISSING_FEATURES.md`, which still lists several items that are already implemented.

---

## Scope

This list focuses on:

- unfinished product features that are visible in the current codebase
- missing backend/API pieces behind existing UI
- operational and deployment work still needed for a production-ready system
- post-MVP hardening work for features that already exist

This list does not repeat speculative future ideas unless there is direct code or roadmap evidence in the repo.

---

## Already Implemented

These are not primary backlog items anymore and should not be re-added as "missing backend" work:

- Client CRUD exists in `app/api/userdetails/clients/route.ts`
- Case CRUD exists in `app/api/userdetails/cases/route.ts`
- Case-to-client linking and unlinking already exists in `app/api/userdetails/cases/route.ts`
- Task CRUD exists in `app/api/userdetails/tasks/route.ts`
- Invoice CRUD and manual payment recording exist in `app/api/userdetails/invoices/route.ts`
- Dashboard stats and upcoming hearing aggregation exist in `app/api/userdetails/dashboard/route.ts`
- Notification MVP is implemented in `app/api/lib/services/notifications.ts`, `app/api/userdetails/notifications/route.ts`, `app/api/internal/notifications/run/route.ts`, and `vercel.json`
- File and image upload APIs already exist via Cloudinary in `app/api/upload/file/route.ts` and `app/api/upload/image/route.ts`
- Clerk user sync fallback exists in `app/api/lib/ensureUser.ts` and `app/api/userdetails/sync/route.ts`
- Acts browsing is functional through `app/acts/page.tsx` and `app/api/public/acts/route.ts`

---

## P0: Immediate Shipping Blockers

- [x] Switch current release to subscription-free mode
  Delivered: `/subscribe` now redirects to `/dashboard` (signed-in) or `/sign-up` (signed-out), subscription CTAs were removed from active navigation/landing flow, and the home page no longer renders pricing.
  Deferred: full billing backend (checkout flow, subscription model, webhook processing, upgrade/downgrade/cancel handling) for later phases.

- [x] Persist contact submissions and route them to a support-team panel
  Delivered: `app/contact-us/page.tsx` submits to a validated/persisted backend via `app/api/complaints/route.ts` + new Mongo model `app/api/lib/models/support-message.ts`.
  Delivered: support review APIs (`app/api/support/check/route.ts`, `app/api/support/messages/route.ts`) and support panel UI (`app/support/dashboard/page.tsx`) are now available for `support`/`admin` roles.
  Delivered: report-fraud was removed from active user navigation and `app/report-fraud/page.tsx` now redirects to dashboard for the current release phase.

- [x] Implement case listing persistence
  Delivered: listing persistence now runs through `app/api/userdetails/cases/[caseId]/add-listing/route.ts` with auth, ownership checks, Mongo persistence, and `zod` payload validation.
  Delivered: `components/case/caseView.tsx` now saves listings through the backend and reloads case data after save instead of local-only insertion.
  Decision: new listings set `courtDate` by default and trigger `syncCalendarEventsForUser` so hearing/calendar reminders stay aligned.

- [x] Finalize required environment and production secret setup
  Delivered: canonical setup guide added in `ENVIRONMENT_SETUP.md` covering local + production configuration and verification.
  Delivered: frontend env template added at `env.frontend.example` with all required app keys.
  Delivered: `backend/.env.example` was sanitized and normalized (removed embedded URI/credentials and invalid key formatting).

---

## P1: Core Product Gaps

- [x] Add subscription lifecycle and plan enforcement
  Delivered: per-user subscription lifecycle state is now persisted on users (plan/status/cycle/renewal/cancel fields) and normalized via `app/api/lib/services/subscription.ts`.
  Delivered: lifecycle API is live at `app/api/userdetails/subscription/route.ts` with `GET` (status) and `PATCH` actions for `cancel`, `renew`, and `change-plan`.
  Delivered: case-limit enforcement is applied in `app/api/userdetails/cases/route.ts`, and paid-feature gating is enforced for parser uploads in `app/api/parser/parse/route.ts`.
  Delivered: billing/plan visibility is exposed in dashboard API + UI (`app/api/userdetails/dashboard/route.ts`, `app/dashboard/page.tsx`).
  

- [x] Connect real payment gateway flows
  Delivered: Stripe checkout/session creation is available at `app/api/userdetails/billing/checkout/route.ts` with authenticated plan-based subscription checkout.
  Delivered: signed Stripe webhook processing is implemented at `app/api/webhook/stripe/route.ts` (checkout completion/failure + invoice payment failure handling).
  Delivered: transaction lifecycle is now persisted end-to-end (pending → completed/failed), including receipt/invoice links and failure reasons via expanded `app/api/lib/models/transaction.ts`.
  Delivered: user billing history API exists at `app/api/userdetails/billing/transactions/route.ts`, and admin transaction UI now shows receipt/invoice links when present.

- [x] Finish invoice workflow beyond CRUD
  Delivered: `app/api/userdetails/invoices/route.ts` now supports PDF generation/download (`GET ?id=...&format=pdf`), email send flow, and Stripe payment-link creation from invoice updates.
  Delivered: Stripe webhook reconciliation now records invoice payments from checkout sessions and updates invoice `paidAmount/status` in `app/api/webhook/stripe/route.ts`.
  Delivered: overdue reminder runner added at `app/api/internal/invoices/reminders/route.ts` with cron auth (`CRON_SECRET`) and daily scheduling in `vercel.json`.
  Delivered: ledger/reporting API added at `app/api/userdetails/invoices/report/route.ts` with summary totals, monthly trend buckets, and client-level outstanding views.
  Delivered: invoice UI actions now call backend workflows (`Send` triggers email + payment link, `Download` fetches generated PDF) in `components/invoice-lexvert/*`.

- [x] Add notification post-MVP hardening
  Delivered: retry + backoff metadata and delivery flow for failed notifications were added in `app/api/lib/models/notification.ts` and `app/api/lib/services/notifications.ts`.
  Delivered: reconciliation now runs when case dates change/delete and from the cron runner via `reconcileNotificationsForCase` and `reconcilePendingHearingNotifications`.
  Delivered: timezone/send-window/reminder-offset preferences are persisted on users and exposed by `app/api/userdetails/notifications/preferences/route.ts`.
  Delivered: missing-email handling now marks failures clearly and avoids endless retry loops.

- [x] Add multi-channel notifications if still in scope
  Delivered: WhatsApp integration is now implemented, including message templates and delivery flows via Twilio API. Updated backend routes and models to support multi-channel preferences.

- [x] Build calendar/event backend and sync
  Current state: Dedicated calendar API routes now exist in `app/api/userdetails/calendar/route.ts` and `app/api/userdetails/calendar/[eventId]/route.ts`, backed by persisted events in `app/api/lib/models/calendar-event.ts`.
  Delivered: manual event CRUD, derived sync from cases/tasks/hearings via `app/api/lib/services/calendar.ts`, and reminder generation tied to calendar entries in `app/api/lib/services/notifications.ts` and `app/api/internal/notifications/run/route.ts`.

- [x] Strengthen case hearing history and reschedule flows
  Delivered: structured `hearingHistory` + `courtDateAuditTrail` are now persisted in `app/api/lib/models/case.ts`.
  Delivered: explicit reschedule workflow is implemented in `app/api/userdetails/cases/[caseId]/reschedule/route.ts` and surfaced in `components/case/caseView.tsx`.
  Delivered: date-change audit/history appends through `app/api/lib/services/caseHearing.ts` and is used by case create/listing/reschedule flows.
  Delivered: notification/calendar reconciliation runs after date updates and case deletion.

- [ ] Complete automated scraper-to-user workflow
  Current state: parser and scraper routes exist, and scraped cases can be promoted into case records manually.
  Missing work: scheduled court download, automatic matching into user-owned case tracking, and plan-aware automation for subscription use cases.

- [x] Replace brittle external acts proxying
  Delivered: public acts API now uses an internal curated dataset (`app/api/lib/data/acts.ts`) instead of third-party proxying.
  Delivered: brittle hard-coded headers/cookies were removed and replaced with safe in-process filtering/pagination in `app/api/public/acts/route.ts`.
  Delivered: acts page search/category behavior now uses the internal API with dynamic categories in `app/acts/page.tsx`.

---

## P2: Feature Gaps In Existing Pages

- [x] Turn suggestions into a real feature
  Delivered: `app/suggestions/page.tsx` now supports persisted suggestion submission, live filtering/search, moderation visibility for user-owned entries, and in-app rating interactions.
  Delivered: suggestions are persisted via `app/api/lib/models/suggestion.ts` with user-facing APIs in `app/api/userdetails/suggestions/route.ts` and per-suggestion rating in `app/api/userdetails/suggestions/[suggestionId]/rating/route.ts`.
  Delivered: moderation/review backend is available to support/admin via `app/api/support/suggestions/route.ts`.

- [x] Separate complaints/contact/fraud into cleaner domain models
  Delivered: contact submissions now persist to dedicated complaint records in `app/api/lib/models/complaint.ts` through `app/api/complaints/route.ts` and are reviewed from `app/api/support/messages/route.ts`.
  Delivered: dedicated fraud-report records now exist in `app/api/lib/models/fraud-report.ts` with validated intake at `app/api/fraud-reports/route.ts`.
  Delivered: fraud evidence attachments are supported in UI through `app/report-fraud/page.tsx` (Cloudinary upload flow + persisted evidence URLs).

- [x] Add admin-facing review tools for incoming user submissions
  Delivered: `app/support/dashboard/page.tsx` now includes operational review workflows for contact requests, fraud reports, suggestion moderation, failed notifications, and billing issues.
  Delivered: fraud review APIs are available at `app/api/support/fraud-reports/route.ts` with status + resolution-note management.
  Delivered: failed-notification triage/retry APIs are available at `app/api/support/notifications/failures/route.ts` with support issue status tracking.
  Delivered: billing-issue review APIs are available at `app/api/support/billing-issues/route.ts`, backed by transaction support workflow metadata in `app/api/lib/models/transaction.ts`.

- [ ] Improve dashboard depth
  Current state: the dashboard already returns real totals and upcoming hearings.
  Missing work: recent activity feed, more detailed analytics, better billing visibility, and richer operational widgets.

- [x] Complete settings and preference surfaces
  Delivered: a full user settings surface now exists at `app/settings/page.tsx` with account preferences, notification/timezone/send-window/reminder controls, and billing/transaction visibility.
  Delivered: persisted account preference APIs are available in `app/api/userdetails/settings/account/route.ts` and user schema support in `app/api/lib/models/user.ts`.
  Delivered: settings are accessible from the main navigation via `components/dashboard/sidebar.tsx`.

---

## P3: Auth, Security, And Multi-User Controls

- [ ] Add full RBAC and team/firm model if the product is meant to support firms
  Current state: user auth works through Clerk, and admin-specific endpoints exist separately.
  Missing work: team membership, firm ownership, role assignment, scoped permissions, and secure multi-user access to shared cases/clients/invoices.

- [ ] Standardize route-level authorization rules
  Current state: many routes call `auth()` and `ensureUser()`, but access checks are not uniformly centralized.
  Missing work: ownership validation, shared-resource authorization, and consistent protection for all non-public endpoints.

- [ ] Add backend input validation consistently
  Current state: many handlers accept raw JSON directly.
  Missing work: validate request payloads with `zod` or equivalent across user, admin, complaint, invoice, case, and task routes.

- [ ] Add rate limiting for public/sensitive routes
  Current state: `express-rate-limit` is installed, but there is no repo-wide Next.js API rate-limiting layer visible in the current routes.
  Missing work: protect public forms, upload endpoints, auth-adjacent endpoints, and internal cron-triggered entrypoints where relevant.

---

## P4: Quality, Reliability, And DevOps

- [ ] Restore strict typecheck and lint enforcement in builds
  Current state: `next.config.mjs` explicitly ignores ESLint and TypeScript build errors.
  Missing work: fix current type/lint debt and remove `ignoreDuringBuilds` and `ignoreBuildErrors`.

- [ ] Add broader automated test coverage
  Current state: notification smoke coverage exists via `npm run test:notifications`.
  Missing work: API tests for clients/cases/tasks/invoices/complaints, integration tests for webhook/auth flows, and UI regression coverage for major pages.

- [ ] Add better background-job observability
  Current state: notification cron and scraper routes exist, but operational visibility is limited.
  Missing work: job logs, alerting, retries, execution dashboards, and failure triage for cron-driven flows.

- [ ] Review Mongo indexes and initialization strategy
  Current state: models are auto-registered, but there is no clear repo-level init/index audit workflow.
  Missing work: verify critical indexes for notifications, users, cases, clients, invoices, scraped cases, and transactions.

- [ ] Improve deployment readiness docs
  Missing work: one up-to-date deployment document covering frontend, backend, Mongo, Clerk webhook, SendGrid, Cloudinary, cron, and admin setup.

---

## Optional / Future Roadmap Items

These are reasonable next-phase candidates, but they are not required to call the current core app usable:

- [ ] Client portal or read-only client access
- [ ] Advanced reporting and exports
- [ ] File search, categorization, and document-case association improvements
- [ ] Advanced billing analytics and revenue dashboards
- [ ] Team collaboration features
- [ ] AI-assisted suggestions grounded in live case/client/task data

---

## Recommended Build Order

1. Subscription backend and payment flow
2. Complaint/contact/fraud persistence
3. Case listing persistence and hearing-history normalization
4. Notification retry and reconciliation
5. Invoice finishing features
6. Calendar backend and sync
7. Auth/RBAC hardening
8. Quality and deployment cleanup

---

## Notes About Older Docs

`MISSING_FEATURES.md` is now partially stale.

Examples of items it still marks as missing even though code exists now:

- client backend APIs
- case backend APIs
- task CRUD and persistence
- invoice backend basics
- dashboard real-data aggregation
- notification MVP core loop
- basic upload integration

Use this file for planning current implementation work.