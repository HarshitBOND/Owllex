# Ravenslaw Environment & Production Secret Setup

Canonical setup reference for the current codebase (updated September 2, 2026).

There are exactly two env files in this repo, and they are the single source
of truth for every environment variable the app reads:

- **`.env.local`** (project root) - Next.js frontend + API routes. Set every
  one of these in Vercel too, for both `Production` and `Preview`.
- **`backend/.env`** - Python parser/scraper backend. Set every one of these
  in Render's environment settings.

Both are git-ignored (they hold real secrets). If a variable isn't in one of
these two files, the code doesn't use it - don't add it back.

## 1) Local Setup

1. Create `.env.local` in the project root with the keys from the table below.
2. If running the Python parser backend, create `backend/.env` with the keys from the table below.
3. Fill all required values, then restart dev servers.

## 2) Next.js App (`.env.local` / Vercel)

| Key | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Absolute app URL used in notification links + CSRF origin checks |
| `NEXT_PUBLIC_BACKEND_API` | Recommended | Python backend base URL (defaults to `http://localhost:8000`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend auth key |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side secret used by middleware/auth routes |
| `CLERK_WEBHOOK_SECRET` | Yes | Verifies Clerk webhook signature at `/api/webhook/clerk` |
| `MONGODB_URI` | Yes | Mongo connection for app data |
| `MONGODB_DB` | Yes | Mongo database name used by app |
| `MONGO_SYNC_INDEXES` | Optional | Set `true` for one deploy to force a Mongo index sync, then unset |
| `VAULT_PDF_MAX_IMAGE_EDGE` | Optional | Longest edge, in px, that a vault PDF's page images are downscaled to (default `1600`) |
| `VAULT_PDF_JPEG_QUALITY` | Optional | JPEG quality those images are re-encoded at (default `72`) |
| `VAULT_PDF_COMPRESSION_TIMEOUT_MS` | Optional | Wall-clock budget for one PDF's image pass; the file is still saved with whatever finished (default `20000`) |
| `OPENAI_API_KEY` | Yes | Powers the AI assistant, contract review, document drafting |
| `AI_RATES_JSON` | Optional | JSON override for per-model token pricing |
| `SENDGRID_API_KEY` | Recommended | Enables support + notification email delivery |
| `NOTIFICATION_FROM_EMAIL` | Recommended | Sender email for SendGrid |
| `NOTIFICATION_FROM_NAME` | Optional | Sender display name (defaults to `Ravenslaw`) |
| `NOTIFICATION_MAX_RETRIES` | Optional | Retry attempts for failed hearing-reminder sends (default 3) |
| `SUPPORT_TEAM_EMAIL` | Recommended | Destination inbox for contact form + fraud report submissions |
| `CRON_SECRET` | Yes | Protects `/api/internal/*` routes (scraper, notifications, invoice reminders) |
| `BACKEND_INTERNAL_TOKEN` | Yes (if backend enabled) | Shared secret sent to backend via `x-internal-token`; must match `RAVENSLAW_INTERNAL_TOKEN` in Render |
| `R2_ACCOUNT_ID` | Yes (uploads) | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | Yes (uploads) | Cloudflare R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | Yes (uploads) | Cloudflare R2 API token secret |
| `R2_PRIVATE_BUCKET` | Yes (uploads) | Bucket for private files (attachments, contract reviews, corpus documents) - accessed only via short-lived presigned URLs |
| `R2_PUBLIC_BUCKET` | Yes (uploads) | Bucket for public rich-text images (`public/...` keys) |
| `R2_PUBLIC_BASE_URL` | Yes (uploads) | Public origin for `R2_PUBLIC_BUCKET`, gated by the `cloudflare/public-docs-gateway` Worker |
| `RAZORPAY_KEY_ID` | Yes (billing) | Razorpay key ID for payment-link APIs |
| `RAZORPAY_KEY_SECRET` | Yes (billing) | Razorpay key secret for server-side billing routes |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (billing) | Razorpay webhook signing secret for `/api/webhook/razorpay` |
| `RAZORPAY_AMOUNT_STARTER_MONTHLY` / `_YEARLY` | Yes (billing) | Starter plan price, INR minor units |
| `RAZORPAY_AMOUNT_PROFESSIONAL_MONTHLY` / `_YEARLY` | Yes (billing) | Professional plan price, INR minor units |
| `RAZORPAY_AMOUNT_ENTERPRISE_MONTHLY` / `_YEARLY` | Yes (billing) | Enterprise plan price, INR minor units |
| `UPSTASH_REDIS_REST_URL` | Recommended (production) | Shared store for distributed API rate limiting; falls back to weaker in-memory limiting without it |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended (production) | Token for Upstash REST Redis |
| `STRICT_CSRF_PROTECTION` | Optional | Forces CSRF origin checks on/off; defaults to on when `NODE_ENV=production` |

`R2_PRIVATE_BUCKET` and `R2_PUBLIC_BUCKET` can be the same physical bucket
(private/public enforced by key prefix, not bucket separation) - only safe
because the public domain is gated by the `cloudflare/public-docs-gateway`
Worker rather than bound to the bucket directly.

## 3) Parser Backend (`backend/.env` / Render)

| Key | Required | Purpose |
|---|---|---|
| `RAVENSLAW_HOST` | Optional | Backend host bind (default `0.0.0.0`) |
| `PORT` | Optional | Render sets this automatically; only set locally |
| `RAVENSLAW_DEBUG` | Yes (`false` in production) | Blocks HTTP-only CORS origins and requires CORS/trusted-hosts to be set explicitly when off |
| `ENABLE_SCRAPER_SCHEDULER` | Optional | Enables the background cause-list scraper schedule |
| `RAVENSLAW_CORS_ORIGINS` | Yes (production) | Comma-separated, HTTPS-only allowed origins - must include the deployed Vercel domain |
| `RAVENSLAW_TRUSTED_HOSTS` | Yes (production) | Comma-separated allowed `Host` headers - the Render service's own domain |
| `RAVENSLAW_RATE_LIMIT_WINDOW_SECONDS` / `_MAX_REQUESTS` | Optional | Backend-side rate limiting |
| `RAVENSLAW_INTERNAL_TOKEN` | Yes | Must match frontend `BACKEND_INTERNAL_TOKEN` |
| `RAVENSLAW_UPLOAD_DIR` | Optional | Temp upload directory |
| `RAVENSLAW_MAX_PDF_SIZE_MB` | Optional | Max upload size |
| `RAVENSLAW_MAX_CONCURRENT_BULK_IMPORTS` | Optional | Bulk import concurrency guard |
| `RAVENSLAW_IMPORT_PROGRESS_TTL_SECONDS` | Optional | Bulk import progress cache TTL |
| `MONGODB_URI` | Recommended | Parser persistence store |
| `MONGODB_DB` | Recommended | Parser database name |
| `CLERK_JWT_ISSUER` | Recommended | Without it, issuer verification is skipped entirely |
| `CLERK_JWT_AUDIENCE` | Optional | Only needed if audience verification is turned on in Clerk |
| `PDF_DOWNLOAD_ENABLED` | Optional | Enables the cause-list PDF scraper |
| `COURT_WEBSITE_URL` | Optional | Source URL for the cause-list scraper |
| `OPENAI_API_KEY` | Recommended (RAG) | Embeddings + metadata extraction; ingest/search return 503 without it |
| `CHROMA_API_KEY` / `CHROMA_TENANT` / `CHROMA_DATABASE` | Recommended (RAG) | Chroma Cloud vector store; ingest/search return 503 until all three are set |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Recommended | Source PDF storage; ingest works without them but skips uploading the source PDF |
| `R2_PUBLIC_DOCS_BASE_URL` | Optional | Public origin bound to `R2_BUCKET`; leave unset until a domain is bound |

`RAVENSLAW_CORS_ORIGINS` and `RAVENSLAW_TRUSTED_HOSTS` must be set explicitly
in Render (no wildcards, HTTPS only) - the backend refuses to boot in
production without them (see `backend/app/config.py`).

## 4) Production Secret Checklist

- `NEXT_PUBLIC_APP_URL` must match your deployed frontend domain.
- `CRON_SECRET` must be set in Vercel so cron-authenticated calls to `/api/internal/notifications/run` succeed.
- Configure Clerk webhook endpoint as: `https://<your-domain>/api/webhook/clerk`.
- Use the Clerk webhook signing secret as `CLERK_WEBHOOK_SECRET`.
- Configure Razorpay webhook endpoint as: `https://<your-domain>/api/webhook/razorpay`.
- Use Razorpay webhook signing secret as `RAZORPAY_WEBHOOK_SECRET`.
- Ensure SendGrid sender (`NOTIFICATION_FROM_EMAIL`) is verified in SendGrid.
- `BACKEND_INTERNAL_TOKEN` (Vercel) and `RAVENSLAW_INTERNAL_TOKEN` (Render) must be byte-identical.
- `RAVENSLAW_CORS_ORIGINS` (Render) must include the exact Vercel production domain.

## 5) Quick Verification

After env setup, verify:

1. Sign-in and case pages load without Mongo errors.
2. Contact form submission creates records and sends email (if SendGrid keys set).
3. File/image uploads succeed.
4. `/api/webhook/clerk` validates webhook signatures.
5. Admin pages only load for users with server-side `admin` role checks.
6. Notification cron route authorizes with `CRON_SECRET`.
