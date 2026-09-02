export interface Env {
  BUCKET: R2Bucket
}

// Only these key prefixes are ever served over doc.ravenslaw.com. Everything
// else -- every private attachment, contract-review file, and corpus
// document -- lives in the same bucket under a clerkUid-first key and must
// 404 here exactly as if it didn't exist. Private files are only ever
// fetched through the app's presigned-URL routes, never this domain.
const ALLOWED_PREFIXES = ["raw/", "public/"]

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 })
    }

    const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ""))
    if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      return new Response("Not found", { status: 404 })
    }

    const object = await env.BUCKET.get(key)
    if (!object) {
      return new Response("Not found", { status: 404 })
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("etag", object.httpEtag)
    headers.set("cache-control", "public, max-age=31536000, immutable")

    return new Response(request.method === "HEAD" ? null : object.body, { headers })
  },
}
