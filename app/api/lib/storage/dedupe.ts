import { createHash } from "crypto"
import { headPrivateObject } from "@/app/api/lib/storage/r2"

/**
 * Builds a content-addressed storage key and reports whether the object is
 * already there.
 *
 * Every upload route used to mint a fresh randomUUID() key, so uploading the
 * same file twice stored it twice -- and re-uploading a document after an edit
 * elsewhere, or a user who keeps the same exhibit in two matters, paid in full
 * each time. Keying on the content hash instead makes a repeat upload a HEAD
 * request and nothing more.
 *
 * The hash is of the bytes as uploaded, before any compression. That keeps the
 * key stable regardless of whether Ghostscript ran, what DPI it used, or
 * whether the backend was reachable at the time.
 *
 * Keys stay under the caller's own clerkUid prefix. Two users uploading the
 * same file still store it twice, which is deliberate: a shared key would let
 * one user's upload silently satisfy another's, and would make deletion by
 * either of them affect the other.
 */
export async function contentAddressedKey(opts: {
  prefix: string
  bytes: Buffer | Uint8Array
  filename: string
}): Promise<{ key: string; exists: boolean; sha256: string }> {
  const sha256 = createHash("sha256").update(opts.bytes).digest("hex")
  const key = `${opts.prefix.replace(/\/$/, "")}/${sha256}-${opts.filename}`

  // A HEAD failure (R2 hiccup, misconfiguration) must not block the upload --
  // treating it as "not present" just means we write the object again.
  let exists = false
  try {
    exists = (await headPrivateObject(key)).ok
  } catch {
    exists = false
  }

  return { key, exists, sha256 }
}
