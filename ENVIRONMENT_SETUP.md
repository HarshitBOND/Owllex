# LexVert Environment & Production Secret Setup

Canonical setup reference for the current codebase (updated March 15, 2026).

Use this document as the source of truth for runtime environment variables and production secret configuration.

## 1) Local Setup

1. Copy `env.frontend.example` to `.env.local` in project root.
2. If running the Python parser backend, copy `backend/.env.example` to `backend/.env`.
3. Fill all required values, then restart dev servers.

## 2) Next.js App (`.env.local`)

| Key | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | Mongo connection for app data |
| `MONGODB_DB` | Yes | Mongo database name used by app |
| `CLERK_WEBHOOK_SECRET` | Yes | Verifies Clerk webhook signature at `/api/webhook/clerk` |
| `CLOUDINARY_CLOUD_NAME` | Yes (uploads) | Cloudinary upload config |
| `CLOUDINARY_API_KEY` | Yes (uploads) | Cloudinary upload config |
| `CLOUDINARY_API_SECRET` | Yes (uploads) | Cloudinary upload config |
| `RAZORPAY_KEY_ID` | Yes (billing) | Razorpay key ID for payment-link APIs |
| `RAZORPAY_KEY_SECRET` | Yes (billing) | Razorpay key secret for server-side billing routes |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (billing) | Razorpay webhook signing secret for `/api/webhook/razorpay` |
| `RAZORPAY_AMOUNT_STARTER_MONTHLY` | Yes (billing) | Starter monthly amount in INR (major unit, e.g. `999`) |
| `RAZORPAY_AMOUNT_STARTER_YEARLY` | Yes (billing) | Starter yearly amount in INR |
| `RAZORPAY_AMOUNT_PROFESSIONAL_MONTHLY` | Yes (billing) | Professional monthly amount in INR |
| `RAZORPAY_AMOUNT_PROFESSIONAL_YEARLY` | Yes (billing) | Professional yearly amount in INR |
| `RAZORPAY_AMOUNT_ENTERPRISE_MONTHLY` | Yes (billing) | Enterprise monthly amount in INR |
| `RAZORPAY_AMOUNT_ENTERPRISE_YEARLY` | Yes (billing) | Enterprise yearly amount in INR |
| `SENDGRID_API_KEY` | Recommended | Enables support + notification email delivery |
| `NOTIFICATION_FROM_EMAIL` | Recommended | Sender email for SendGrid |
| `NOTIFICATION_FROM_NAME` | Optional | Sender display name (defaults to `LexVert`) |
| `SUPPORT_TEAM_EMAIL` | Recommended | Destination inbox for contact form submissions |
| `CRON_SECRET` | Yes | Protects `/api/internal/notifications/run` |
| `NEXT_PUBLIC_APP_URL` | Yes | Absolute app URL used in notification links |
| `NEXT_PUBLIC_BACKEND_API` | Recommended | Python backend base URL (defaults to `http://localhost:8000`) |
| `BACKEND_INTERNAL_TOKEN` | Yes (if backend enabled) | Shared secret sent to backend parser/scraper APIs via `x-internal-token` |
| `UPSTASH_REDIS_REST_URL` | Recommended (production) | Shared store for distributed API rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended (production) | Token for Upstash REST Redis |

## 3) Parser Backend (`backend/.env`)

| Key | Required | Purpose |
|---|---|---|
| `LEXVERT_HOST` | Optional | Backend host bind |
| `LEXVERT_PORT` | Optional | Backend port |
| `LEXVERT_DEBUG` | Optional | Backend debug mode |
| `LEXVERT_UPLOAD_DIR` | Optional | Temp upload directory |
| `LEXVERT_MAX_PDF_SIZE_MB` | Optional | Max upload size |
| `MONGODB_URI` | Recommended | Parser persistence store |
| `MONGODB_DB` | Recommended | Parser database name |
| `LEXVERT_CORS_ORIGINS` | Yes (production) | Explicit allowed CORS origins |
| `LEXVERT_INTERNAL_TOKEN` | Yes | Must match frontend `BACKEND_INTERNAL_TOKEN` |

## 4) Production Secret Checklist

Set all Next.js keys above in Vercel project env vars for `Production` and `Preview`.

- `NEXT_PUBLIC_APP_URL` must match your deployed frontend domain.
- `CRON_SECRET` must be set in Vercel so cron-authenticated calls to `/api/internal/notifications/run` succeed.
- Configure Clerk webhook endpoint as: `https://<your-domain>/api/webhook/clerk`.
- Use the Clerk webhook signing secret as `CLERK_WEBHOOK_SECRET`.
- Configure Razorpay webhook endpoint as: `https://<your-domain>/api/webhook/razorpay`.
- Use Razorpay webhook signing secret as `RAZORPAY_WEBHOOK_SECRET`.
- Ensure SendGrid sender (`NOTIFICATION_FROM_EMAIL`) is verified in SendGrid.
- Ensure Cloudinary credentials are from the same Cloudinary product environment used for uploads.

## 5) Quick Verification

After env setup, verify:

1. Sign-in and case pages load without Mongo errors.
2. Contact form submission creates records and sends email (if SendGrid keys set).
3. File/image uploads succeed.
4. `/api/webhook/clerk` validates webhook signatures.
5. Admin pages only load for users with server-side `admin` role checks.
6. Notification cron route authorizes with `CRON_SECRET`.
