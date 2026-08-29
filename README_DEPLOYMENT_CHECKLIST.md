# LexVert Deployment Checklist + Env Guide

Use this file as your single source of truth for launch. Tick each item as you complete it.

## Deployment Checklist

- [x] Run `npm run build` and confirm no errors
- [ ] Run `npm run test` and confirm all tests pass
- [ ] Set frontend env vars in Vercel (Production + Preview)
- [ ] Set backend env vars in your backend host/container
- [ ] Rotate production secrets (`BACKEND_INTERNAL_TOKEN`, `JWT_SECRET`)
- [ ] Configure Clerk webhook
- [ ] Configure Razorpay webhook
- [ ] Verify SendGrid sender identity
- [ ] Verify cron routes work with `CRON_SECRET`
- [ ] Do a production smoke test (sign-in, dashboard, uploads, payments)

## Vercel Frontend-Only Setup

Use these settings so Vercel deploys only the Next.js frontend from this repo:

1. In Vercel Project Settings -> General:
	- Framework Preset: `Next.js`
	- Root Directory: `./` (repo root where `package.json` lives)
2. In Vercel Project Settings -> Build & Development Settings:
	- Build Command: `npm run build`
	- Install Command: `npm install`
3. Keep `.vercelignore` committed with `backend/**` excluded.
4. Deploy FastAPI backend (`backend/`) on a separate platform and set `NEXT_PUBLIC_BACKEND_API` in Vercel to that backend URL.

## Frontend Environment Variables (Vercel)

Set these in Vercel for **Production** and **Preview**:

- `MONGODB_URI`
- `MONGODB_DB`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
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

## Backend Environment Variables (backend/.env)

Set these where the FastAPI backend runs:

- `MONGODB_URI`
- `MONGODB_DB`
- `LEXVERT_HOST`
- `LEXVERT_PORT`
- `LEXVERT_DEBUG=false`
- `LEXVERT_UPLOAD_DIR`
- `LEXVERT_MAX_PDF_SIZE_MB`
- `LEXVERT_CORS_ORIGINS`
- `LEXVERT_INTERNAL_TOKEN` (generate a fresh one for production)

## How the .env Files Work (Simple Explanation)

This repo has multiple `.env` files because **frontend and backend are separate apps** and because **dev vs production** have different needs.

### 1) Frontend (Next.js)

Next.js reads env vars in this priority order:

1. `.env.local` (highest priority, for your machine only)
2. `.env.development` or `.env.production` (depending on `NODE_ENV`)
3. `.env` (lowest priority, shared defaults)

Important rules:

- **Anything starting with `NEXT_PUBLIC_` is exposed to the browser.**
- Everything else is server-only.
- `.env.local` should never be committed.
- In Vercel, **Vercel envs override local files** in production.

### 2) Backend (FastAPI in backend/)

The backend reads env vars from:

- `backend/.env` (local or container environment)
- or from your hosting provider's environment variables

Important rules:

- Backend does **not** use `NEXT_PUBLIC_*`.
- Keep secrets only in the backend environment.
- Do not commit `backend/.env`.

### 3) .env.example Files

These are **templates**. They show the required keys but should **never contain real secrets**.  
When starting a new environment, copy `.env.example` to `.env.local` (frontend) or `backend/.env` (backend) and fill in real values.

## Recommended Flow

1. Use `.env.example` files as a checklist for required keys.
2. Keep local values in `.env.local` and `backend/.env`.
3. Set production values in Vercel + backend host, not in files.
4. Never commit secrets into git.
