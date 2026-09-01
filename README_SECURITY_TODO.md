# Security Hardening TODO (Priority Checklist)

> Goal: reduce real attack surface and close risky patterns found in the current codebase.
> Note: “zero risk” is not realistic, but this list gets you much closer to production-grade security.

## P0 — Critical (fix first)

- [x] **Remove/disable debug auth endpoint in production**
  - Risk: user/account data disclosure and internal debug info exposure.
  - Evidence: `app/api/test-auth/route.ts` (returns user profile + debug details).
  - Action: delete this route or guard it behind strict server-only admin + environment kill switch.

- [x] **Stop using public admin slug as a security control**
  - Risk: security-by-obscurity; slug is exposed to client bundle because it is `NEXT_PUBLIC_*`.
  - Evidence: `app/admin/[slug]/page.tsx` uses `NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL`.
  - Action: remove slug check as auth control; enforce admin authorization fully server-side on every admin API/page request.

- [x] **Lock down backend auth for parser/scraper endpoints**
  - Risk: unauthenticated expensive operations can be abused (DoS/data abuse) if backend is internet-accessible.
  - Evidence: `backend/app/scraper_routes.py` (`/run-now`, `/upload-and-parse`, `/parse-causelist-bulk`, etc.) has no auth guard.
  - Action: require signed internal token/JWT/mTLS/IP allowlist for all non-public backend routes.

- [x] **Remove or strictly gate `/parse/path` endpoint**
  - Risk: arbitrary filesystem path parsing/read attempts.
  - Evidence: `backend/app/routes.py` -> `parse_from_path(pdf_path: str)` reads server path from request query.
  - Action: disable in production, or restrict to allowlisted directory + internal auth only.

- [x] **Fix permissive CORS default in backend config**
  - Risk: wildcard origin fallback is dangerous and misconfigured with credentials.
  - Evidence: `backend/app/config.py` defaults `RAVENSLAW_CORS_ORIGINS` to `*`; `backend/app/main.py` uses `allow_credentials=True`.
  - Action: fail startup when CORS env is missing in production; explicit allowlist only.

## P1 — High

- [x] **Eliminate unsafe CSP directives (`unsafe-inline`, `unsafe-eval`) where possible**
  - Risk: easier XSS/script injection impact.
  - Evidence: `next.config.mjs` CSP header includes both.
  - Action: move to nonce-based CSP for scripts; remove `unsafe-eval`; minimize `unsafe-inline`.

- [x] **Sanitize rich-text HTML before rendering/writing to DOM**
  - Risk: stored XSS through note content or edited HTML.
  - Evidence: `components/editor/Editior.tsx` assigns `contentRef.current.innerHTML = note.content`.
  - Action: sanitize HTML with a strict allowlist (e.g., DOMPurify) before storing and before rendering.

- [x] **Avoid writing raw HTML into print window**
  - Risk: DOM-based XSS if printable content becomes tainted.
  - Evidence: `app/generate-affidavit/page.tsx` uses `printWindow.document.write(docRef.current.innerHTML)`.
  - Action: render from safe template/text only, or sanitize before write.

- [x] **Harden file upload validation**
  - Risk: MIME spoofing/arbitrary file upload abuse.
  - Evidence: `app/api/upload/file/route.ts` and `app/api/upload/image/route.ts` trust `file.type` and upload with `resource_type: "auto"`.
  - Action: verify magic bytes/signature, enforce extension allowlist, apply antivirus scanning for risky file classes, and tighter Cloudinary restrictions.

- [x] **Prevent regex-based ReDoS from untrusted search input**
  - Risk: crafted regex payload can spike CPU.
  - Evidence: `app/api/public/cases/route.ts` uses unescaped user inputs in `$regex` (e.g., `advocateName`, `caseYear`).
  - Action: escape regex literals or use text indexes / exact-match strategies with bounded query complexity.

- [x] **Protect backend docs in production**
  - Risk: easier endpoint reconnaissance.
  - Evidence: `backend/app/main.py` enables `/docs` and `/redoc` always.
  - Action: disable docs/redoc in production or protect behind admin/internal auth.

## P2 — Medium

- [x] **Reduce sensitive logging in API/webhook flows**
  - Risk: PII/token-adjacent data leakage in logs.
  - Evidence: `app/api/webhook/clerk/route.ts`, `app/api/lib/ensureUser.ts`, `app/api/test-auth/route.ts` log user identifiers/emails.
  - Action: remove verbose logs in prod; structured redaction policy.

- [x] **Stop returning raw internal error details to clients**
  - Risk: information disclosure for attackers.
  - Evidence: `app/api/upload/file/route.ts` returns `message: error.message`; `app/api/test-auth/route.ts` returns `String(error)`.
  - Action: return generic user-safe errors; keep stack/error details server-side only.

- [x] **Upgrade rate limiting to shared store**
  - Risk: in-memory limiter bypass across instances/restarts.
  - Evidence: `app/api/lib/rateLimit.ts` uses process-local `Map`; `app/api/lib/adminMiddleware.ts` also local map.
  - Action: move to Redis/Upstash-based limiter and central policy by route sensitivity.

- [x] **Use constant-time secret comparison for cron tokens**
  - Risk: timing side-channel (low, but avoidable).
  - Evidence: `app/api/lib/services/notificationRunnerAuth.ts` compares with `===`.
  - Action: compare fixed-length buffers with timing-safe method.

- [x] **Add missing hardening headers**
  - Risk: weaker browser-side isolation controls.
  - Evidence: `middleware.ts`/`next.config.mjs` set some headers but not full modern baseline.
  - Action: add `Strict-Transport-Security`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Resource-Policy` as appropriate.

## Program-level controls (recommended)

- [x] Add SAST + dependency scanning in CI (`npm audit`, `pip-audit`, GitHub Dependabot, CodeQL).
- [x] Add secret scanning in CI and pre-commit hooks.
- [x] Add security regression tests for authz, upload validation, and XSS sanitization.
- [x] Create an incident response playbook (log retention, key rotation, webhook secret rotation, rollback process).

## Suggested execution order

1. P0 endpoints/auth/CORS lock-down
2. XSS + CSP hardening
3. Upload and regex query hardening
4. Logging/error redaction
5. CI security automation + periodic reviews
