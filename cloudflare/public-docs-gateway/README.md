# public-docs-gateway

Fronts `doc.ravenslaw.com` in place of R2's direct "public bucket" custom
domain binding. `owllex-pdf` holds both public documents (judgments/laws
under `raw/...`, public rich-text images under `public/...`) and every
private vault file (attachments, contract reviews, corpus documents, all
keyed `<clerkUid>/...`) in one bucket. Binding a custom domain straight to
the bucket, as it is today, serves every key in it with no auth check. This
Worker is the fix: it only serves `raw/` and `public/` keys and 404s
everything else, so private keys are never reachable from this domain no
matter what leaks (a DB backup, a log line, a screenshot) -- they're only
ever fetched through the app's presigned-URL routes.

## Deploy

```
cd cloudflare/public-docs-gateway
npx wrangler login   # if not already authenticated to the owllex account
npx wrangler deploy
```

## Cut over the domain (do this in order, or PDFs go down briefly)

1. Deploy the Worker (above) first, so it exists before anything points at it.
2. Cloudflare dashboard → R2 → `owllex-pdf` → Settings → Custom Domains →
   remove/disconnect `doc.ravenslaw.com` from the bucket.
3. Cloudflare dashboard → Workers & Pages → `owllex-public-docs-gateway` →
   Settings → Domains & Routes → Add Custom Domain → `doc.ravenslaw.com`.
4. Verify:
   - An existing public judgment URL (`doc.ravenslaw.com/raw/...`) still
     loads.
   - Any `doc.ravenslaw.com/<clerkUid>/...`-shaped URL returns 404.
