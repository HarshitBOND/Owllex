# LexVert Deployment TODO Checklist

Last updated: March 23, 2026

Use this file as your launch tracker. Tick each item as you complete it.

---

## 1) P0 — Blocking Items (Must be done before deploy)

- [x] Replace Stripe billing flow with Razorpay (UPI-friendly) across checkout, invoice links, and webhook processing.
- [x] Run `npm run build` and confirm it exits with code `0`.
- [x] Confirm build output has no `Failed to compile` errors.

---

## 2) Frontend Env & Secrets (Vercel: Production + Preview)

Set and verify all required keys:

- [ ] `MONGODB_URI`
- [ ] `MONGODB_DB`
- [ ] `CLERK_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_BACKEND_API`
- [ ] `NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL`
- [ ] `CRON_SECRET`
- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_PRIVATE_BUCKET`
- [ ] `R2_PUBLIC_BUCKET`
- [ ] `R2_PUBLIC_BASE_URL`
- [x] `SENDGRID_API_KEY`
- [x] `NOTIFICATION_FROM_EMAIL`
- [x] `NOTIFICATION_FROM_NAME`
- [x] `SUPPORT_TEAM_EMAIL`
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `RAZORPAY_WEBHOOK_SECRET`
- [ ] `RAZORPAY_AMOUNT_STARTER_MONTHLY`
- [ ] `RAZORPAY_AMOUNT_STARTER_YEARLY`
- [ ] `RAZORPAY_AMOUNT_PROFESSIONAL_MONTHLY`
- [ ] `RAZORPAY_AMOUNT_PROFESSIONAL_YEARLY`
- [ ] `RAZORPAY_AMOUNT_ENTERPRISE_MONTHLY`
- [ ] `RAZORPAY_AMOUNT_ENTERPRISE_YEARLY`

From local audit, these keys were missing in `.env.local` and must be set:

- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_PRIVATE_BUCKET`
- [ ] `R2_PUBLIC_BUCKET`
- [ ] `R2_PUBLIC_BASE_URL`
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `RAZORPAY_WEBHOOK_SECRET`
- [ ] `RAZORPAY_AMOUNT_STARTER_MONTHLY`
- [ ] `RAZORPAY_AMOUNT_STARTER_YEARLY`
- [ ] `RAZORPAY_AMOUNT_PROFESSIONAL_MONTHLY`
- [ ] `RAZORPAY_AMOUNT_PROFESSIONAL_YEARLY`
- [ ] `RAZORPAY_AMOUNT_ENTERPRISE_MONTHLY`
- [ ] `RAZORPAY_AMOUNT_ENTERPRISE_YEARLY`
- [ ] `SUPPORT_TEAM_EMAIL`

---

## 3) Parser Backend Env (If parser backend is part of production)

- [ ] Create `backend/.env` from `backend/.env.example`.
- [ ] Set `MONGODB_URI` and `MONGODB_DB`.
- [ ] Set `LEXVERT_HOST`, `LEXVERT_PORT`, `LEXVERT_DEBUG`.
- [ ] Set `LEXVERT_UPLOAD_DIR`, `LEXVERT_MAX_PDF_SIZE_MB`.
- [ ] Set `LEXVERT_CORS_ORIGINS` to your frontend domain(s).

---

## 4) External Service Setup

- [ ] Configure Clerk webhook: `https://<your-domain>/api/webhook/clerk`.
- [ ] Confirm `CLERK_WEBHOOK_SECRET` matches webhook signing secret.
- [ ] Configure Razorpay webhook: `https://<your-domain>/api/webhook/razorpay`.
- [ ] Confirm `RAZORPAY_WEBHOOK_SECRET` matches Razorpay signing secret.
- [ ] Verify all Razorpay plan amount env values map to your live pricing.
- [ ] Verify SendGrid sender identity for `NOTIFICATION_FROM_EMAIL`.
- [ ] Verify Cloudinary credentials are from the intended cloud environment.

---

## 5) Cron & Internal Jobs

- [ ] Confirm `CRON_SECRET` is set in Vercel.
- [ ] Verify cron route `/api/internal/scraper/automation` runs successfully.
- [ ] Verify cron route `/api/internal/notifications/run` runs successfully.
- [ ] Verify cron route `/api/internal/invoices/reminders` runs successfully.

---

## 6) Production Smoke Checks

- [ ] Clerk auth/sign-in works in production.
- [ ] `ensureUser` auto-provisions when webhook misses a user.
- [ ] Contact + fraud forms persist and support receives notifications.
- [ ] Upload endpoints accept valid authenticated file/image uploads.
- [ ] Razorpay checkout and webhook reconciliation complete successfully.
- [ ] Dashboard shows analytics, billing, activity, and job widgets.
- [ ] Team/Firm creation and role updates work.

---

## 7) Final Verification Commands

- [ ] `npm run build` (must pass)
- [ ] `npm run test`
- [ ] `npm run test:notifications`
- [ ] `npm run audit:indexes`
- [ ] `npm run lint` (currently warnings-only; cleanup recommended)

---

## 8) Launch Decision

- [ ] All P0/P1 items above completed.
- [ ] Final smoke checks completed in production environment.
- [ ] Go-live approved.
