import { createHash, createHmac, timingSafeEqual } from "crypto"
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth"

/**
 * Object storage backed by the Hetzner volume, replacing Cloudflare R2.
 *
 * The exported surface is deliberately identical to the R2 module it replaces --
 * same function names, same arguments, same return shapes -- so removing the
 * bucket was a change to this one file rather than to the fourteen routes that
 * store and read documents. Underneath, every call is an authenticated request
 * to the backend, which owns the volume; Next never touches a filesystem path
 * and never learns one.
 *
 * **Signed URLs are not presigned URLs any more.** R2's were bearer capabilities:
 * anyone holding the link had the object until it expired, wherever they were.
 * These are HMACs over (key, expiry, audience) that only this app can mint and
 * only this app can redeem, through `/api/storage/object` -- which re-checks the
 * session on every request. Passing `boundTo` ties the URL to one Clerk user, so
 * a leaked link is useless to anybody else; without it the URL still requires
 * *a* valid session, which is already stricter than what R2 gave us.
 */

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000"

/** Backend routes are mounted under this prefix; see backend/app/main.py. */
const OBJECTS_BASE = `${BACKEND_API.replace(/\/$/, "")}/api/v1/rag/objects`

const SIGNED_URL_MAX_TTL_SECONDS = 60 * 60

function objectUrl(key: string): string {
  // Each segment is encoded separately: the key's slashes are path structure and
  // must survive, while everything else in a segment must not be able to become
  // structure. encodeURIComponent on the whole key would break the first; a bare
  // template string would let a key containing "../" address another prefix.
  const encoded = key
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join("/")
  return `${OBJECTS_BASE}/${encoded}`
}

/**
 * Rejects a key that could address something other than the object intended.
 *
 * The backend refuses these too -- containment is proved there, against the real
 * filesystem, which is the check that actually counts. This one exists so a bad
 * key fails in the process that produced it, with a stack trace pointing at the
 * caller, instead of as an opaque 400 from another service.
 */
function assertSafeKey(key: string): void {
  if (!key || !key.trim()) throw new Error("A storage key is required")
  if (key.length > 1024) throw new Error("Storage key is too long")
  if (key.startsWith("/") || key.includes("..") || key.includes("\0")) {
    throw new Error("Refusing an unsafe storage key")
  }
}

async function backendFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...getBackendInternalHeaders(), ...(init.headers || {}) },
    cache: "no-store",
  })
}

export async function putPrivateObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  assertSafeKey(key)

  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(body)], { type: contentType }), "upload.bin")

  const response = await backendFetch(objectUrl(key), { method: "PUT", body: form })
  if (!response.ok) {
    throw new Error(`Object store PUT failed: HTTP ${response.status}`)
  }
}

/**
 * Stores an object that is served without a session, and returns its URL.
 *
 * Public here means "no login required to view it" -- avatars, uploaded logos --
 * not "on a public bucket". The bytes still live on the private volume behind
 * the backend; the only thing that is public is one app route that streams them.
 */
export async function putPublicObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const publicKey = `public/${key.replace(/^\/+/, "")}`
  await putPrivateObject(publicKey, body, contentType)

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  return `${base}/api/storage/public/${key.split("/").map(encodeURIComponent).join("/")}`
}

export async function getPrivateObject(
  key: string
): Promise<{ ok: boolean; status: number; body?: Buffer }> {
  assertSafeKey(key)

  const response = await backendFetch(objectUrl(key))
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  return { ok: true, status: response.status, body: Buffer.from(await response.arrayBuffer()) }
}

export async function headPrivateObject(
  key: string
): Promise<{ ok: boolean; status: number; contentLength: number | null; etag: string | null }> {
  assertSafeKey(key)

  const response = await backendFetch(objectUrl(key), { method: "HEAD" })
  const contentLength = response.headers.get("content-length")
  return {
    ok: response.ok,
    status: response.status,
    contentLength: contentLength === null ? null : Number(contentLength),
    etag: response.headers.get("etag"),
  }
}

export async function deletePrivateObject(key: string): Promise<void> {
  assertSafeKey(key)

  const response = await backendFetch(objectUrl(key), { method: "DELETE" })
  // The backend reports a missing object as success for a delete: the caller
  // wanted it gone and it is. Anything else is a real failure.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Object store DELETE failed: HTTP ${response.status}`)
  }
}

/** Streams an object out of the backend, passing a Range header through. */
export async function streamPrivateObject(
  key: string,
  range?: string | null
): Promise<Response> {
  assertSafeKey(key)
  return backendFetch(objectUrl(key), { headers: range ? { Range: range } : {} })
}

// ─── Signed access tokens ────────────────────────────────────────────────────

function signingSecret(): string {
  const secret =
    process.env.STORAGE_URL_SECRET?.trim() || process.env.BACKEND_INTERNAL_TOKEN?.trim()
  if (!secret) {
    throw new Error("Missing STORAGE_URL_SECRET (or BACKEND_INTERNAL_TOKEN) for signed URLs")
  }
  return secret
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url")
}

export type SignedObjectToken = {
  key: string
  expiresAt: number
  boundTo: string | null
}

/**
 * A short-lived, app-redeemable URL for a stored object.
 *
 * `boundTo` should be the Clerk uid of whoever the URL is being handed to.
 * `/api/storage/object` then refuses to serve it to any other session, which is
 * the property R2's presigned URLs never had: those worked for whoever held the
 * string, so a link pasted into a shared chat leaked the document.
 */
export async function getPrivateSignedUrl(
  key: string,
  expiresInSeconds: number,
  boundTo?: string | null
): Promise<string> {
  assertSafeKey(key)

  const ttl = Math.min(Math.max(Math.floor(expiresInSeconds) || 60, 1), SIGNED_URL_MAX_TTL_SECONDS)
  const expiresAt = Math.floor(Date.now() / 1000) + ttl
  const audience = boundTo?.trim() || ""

  const params = new URLSearchParams({ k: key, e: String(expiresAt) })
  if (audience) params.set("a", audience)
  params.set("s", sign(`${key}\n${expiresAt}\n${audience}`))

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  return `${base}/api/storage/object?${params.toString()}`
}

/**
 * Verifies a signed URL's parameters. Returns null for anything not valid now.
 *
 * The signature is compared with `timingSafeEqual` over a fixed-length digest.
 * A `===` on the base64 would leak, byte by byte, how much of a guessed
 * signature was right -- which over enough requests is how a forgery gets built.
 */
export function verifySignedObjectToken(params: URLSearchParams): SignedObjectToken | null {
  const key = params.get("k")
  const expiresRaw = params.get("e")
  const signature = params.get("s")
  const audience = params.get("a") || ""

  if (!key || !expiresRaw || !signature) return null

  try {
    assertSafeKey(key)
  } catch {
    return null
  }

  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null

  const expected = Buffer.from(sign(`${key}\n${expiresAt}\n${audience}`))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  return { key, expiresAt, boundTo: audience || null }
}

/** SHA-256 of a buffer, hex. Kept here so callers hash what they store. */
export function sha256(body: Buffer | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex")
}
