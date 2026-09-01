# Security Incident Response Playbook

## 1) Severity Matrix

- **SEV-1 (Critical):** Active exploit, data breach, auth bypass, payment compromise.
- **SEV-2 (High):** Confirmed vulnerability with high impact, no confirmed breach.
- **SEV-3 (Medium):** Limited impact issue, mitigations available.

## 2) First 15 Minutes (Containment)

1. Create incident channel and assign Incident Commander.
2. Freeze deployments.
3. Rotate exposed secrets immediately (Clerk webhook secret, CRON secret, backend internal token, Cloudinary, payment keys).
4. Apply emergency blocks:
   - Disable affected route/feature behind env kill switch.
   - Tighten WAF / firewall / IP allowlist as needed.
5. Snapshot evidence (logs, request IDs, timestamps, IPs, payload samples).

## 3) Investigation

- Confirm scope: impacted users, affected data classes, start/end time window.
- Check indicators:
  - Auth anomalies (unexpected admin access, token misuse)
  - Upload abuse patterns
  - Webhook signature failures/spikes
  - Rate-limit bypass indicators
- Maintain immutable timeline in incident notes.

## 4) Eradication & Recovery

1. Patch root cause in code/config.
2. Add regression tests for exploit path.
3. Re-run security workflows (`Security Checks`, `CodeQL`).
4. Restore traffic gradually and monitor error/security metrics.
5. Re-enable deployments after Incident Commander approval.

## 5) Communication

- Internal updates every 30 minutes for SEV-1/2.
- If user impact confirmed, prepare customer notice with:
  - what happened
  - what data may be affected
  - what was fixed
  - required user actions (if any)

## 6) Postmortem (within 72 hours)

- Document root cause, blast radius, timeline, and missed detections.
- Record preventive actions with owners and deadlines.
- Update threat model and this playbook.

## 7) Rotation Checklist

- `CLERK_WEBHOOK_SECRET`
- `CRON_SECRET`
- `BACKEND_INTERNAL_TOKEN` and `RAVENSLAW_INTERNAL_TOKEN`
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
- `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
- `SENDGRID_API_KEY`
- Any leaked Upstash tokens
