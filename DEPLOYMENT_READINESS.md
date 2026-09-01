# Ravenslaw Deployment Readiness Guide

Last updated: March 15, 2026

This is the canonical deployment runbook for frontend + backend + infrastructure dependencies.

## 1) Core Services

- Frontend/API: Next.js app (Vercel recommended)
- Parser/Scraper backend: Python FastAPI app (`backend/`)
- Database: MongoDB
- Auth: Clerk
- Email: SendGrid
- File storage: Cloudinary
- Payments: Razorpay (UPI-friendly)
- Schedules: Vercel Cron + `CRON_SECRET`

## 2) Environment Variables (Frontend)

Set these in Vercel for `Production` and `Preview`:

- `MONGODB_URI`
- `MONGODB_DB`
- `CLERK_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BACKEND_API`
- `NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL`
- `CRON_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `SENDGRID_API_KEY`
- `NOTIFICATION_FROM_EMAIL`
- `NOTIFICATION_FROM_NAME`
- `SUPPORT_TEAM_EMAIL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_AMOUNT_STARTER_MONTHLY`
- `RAZORPAY_AMOUNT_STARTER_YEARLY`
- `RAZORPAY_AMOUNT_PROFESSIONAL_MONTHLY`
- `RAZORPAY_AMOUNT_PROFESSIONAL_YEARLY`
- `RAZORPAY_AMOUNT_ENTERPRISE_MONTHLY`
- `RAZORPAY_AMOUNT_ENTERPRISE_YEARLY`

Optional reliability controls:

- `MONGO_SYNC_INDEXES=true` (run intentionally for controlled index sync)

## 3) Environment Variables (Parser Backend)

Set in backend host/container:

- `MONGODB_URI`
- `MONGODB_DB`
- `RAVENSLAW_HOST`
- `RAVENSLAW_PORT`
- `RAVENSLAW_DEBUG`
- `RAVENSLAW_UPLOAD_DIR`
- `RAVENSLAW_MAX_PDF_SIZE_MB`
- `RAVENSLAW_CORS_ORIGINS`

## 4) External Endpoint Setup

### Clerk

- Webhook URL: `https://<app-domain>/api/webhook/clerk`
- Secret in app env: `CLERK_WEBHOOK_SECRET`

### Razorpay

- Webhook URL: `https://<app-domain>/api/webhook/razorpay`
- Secret in app env: `RAZORPAY_WEBHOOK_SECRET`
- Ensure all required plan amount env values are configured (INR major units).

### SendGrid

- Verify sender address used by `NOTIFICATION_FROM_EMAIL`
- Validate outbound delivery for support + reminders.

### Cloudinary

- Use matching cloud environment for all upload credentials.

## 5) Scheduled Jobs (Vercel Cron)

Configured in `vercel.json`:

- `/api/internal/scraper/automation`
- `/api/internal/notifications/run`
- `/api/internal/invoices/reminders`

All internal cron routes require `CRON_SECRET` via `x-cron-secret` header or Bearer token.

## 6) RBAC / Team Controls

- Team/firm API: `/api/userdetails/team`
- Firm membership roles: `owner`, `admin`, `member`, `viewer`
- Shared firm scope reads available via `scope=firm` for core user details routes.

## 7) Production Validation Checklist

- [ ] User auth/sign-in works with Clerk
- [ ] `ensureUser` auto-provisions records when webhook misses a user
- [ ] Contact and fraud forms persist + notify support
- [ ] Upload endpoints accept valid files/images with auth and limits
- [ ] Razorpay checkout + webhook transaction reconciliation succeeds
- [ ] Invoice reminders and notification cron jobs run successfully
- [ ] Scraper automation cron triggers import + auto-match pipeline
- [ ] Dashboard shows activity, analytics, billing, and recent jobs
- [ ] Team/Firm creation and membership role updates work
- [ ] `npm run build` passes with strict lint/type checks enabled

## 8) Operational Commands

- Build: `npm run build`
- Lint: `npm run lint`
- Tests: `npm run test`
- Notification smoke test: `npm run test:notifications`
- Index audit: `npm run audit:indexes`

## 9) Failure Triage

- Check recent job runs (notification/invoice/scraper) from dashboard operational widgets.
- Inspect internal route responses for `runId` and summary details.
- Verify parser backend connectivity from frontend (`NEXT_PUBLIC_BACKEND_API`).
- Verify `CRON_SECRET` consistency between Vercel env and cron invocations.
