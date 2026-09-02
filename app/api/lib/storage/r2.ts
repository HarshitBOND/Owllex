import { AwsClient } from "aws4fetch"
import { fetch as undiciFetch } from "undici"

function client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)")
  }
  return new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" })
}

function objectUrl(bucket: string, key: string) {
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accountId) {
    throw new Error("R2_ACCOUNT_ID is not configured")
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
}

async function putObject(bucket: string, key: string, body: Buffer, contentType: string) {
  // Next.js patches the global `fetch` and rewrites fixed-length bodies as
  // chunked-transfer requests, dropping Content-Length. R2 then rejects the
  // signed PUT with HTTP 411. Sign with aws4fetch but send with undici's
  // unpatched fetch so Content-Length reaches R2 correctly.
  const signedRequest = await client().sign(objectUrl(bucket, key), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "Content-Type": contentType },
  })
  const response = await undiciFetch(signedRequest.url, {
    method: "PUT",
    body: new Uint8Array(body),
    headers: signedRequest.headers,
  })
  if (!response.ok) {
    throw new Error(`R2 upload failed: HTTP ${response.status}`)
  }
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  const bucket = process.env.R2_PRIVATE_BUCKET
  if (!bucket) throw new Error("R2_PRIVATE_BUCKET is not configured")
  await putObject(bucket, key, body, contentType)
}

export async function putPublicObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.R2_PUBLIC_BUCKET
  const baseUrl = process.env.R2_PUBLIC_BASE_URL
  if (!bucket || !baseUrl) throw new Error("R2_PUBLIC_BUCKET / R2_PUBLIC_BASE_URL are not configured")
  await putObject(bucket, key, body, contentType)
  return `${baseUrl.replace(/\/$/, "")}/${key}`
}

export async function getPrivateSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
  const bucket = process.env.R2_PRIVATE_BUCKET
  if (!bucket) throw new Error("R2_PRIVATE_BUCKET is not configured")

  const url = new URL(objectUrl(bucket, key))
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds))

  const signedRequest = await client().sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  })
  return signedRequest.url
}

export async function getPrivateObject(
  key: string
): Promise<{ ok: boolean; status: number; body?: Buffer }> {
  const bucket = process.env.R2_PRIVATE_BUCKET
  if (!bucket) throw new Error("R2_PRIVATE_BUCKET is not configured")

  const signedRequest = await client().sign(objectUrl(bucket, key), { method: "GET" })
  const response = await undiciFetch(signedRequest.url, {
    method: "GET",
    headers: signedRequest.headers,
  })
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  const arrayBuffer = await response.arrayBuffer()
  return { ok: true, status: response.status, body: Buffer.from(arrayBuffer) }
}

export async function headPrivateObject(
  key: string
): Promise<{ ok: boolean; status: number; contentLength: number | null; etag: string | null }> {
  const bucket = process.env.R2_PRIVATE_BUCKET
  if (!bucket) throw new Error("R2_PRIVATE_BUCKET is not configured")

  const signedRequest = await client().sign(objectUrl(bucket, key), { method: "HEAD" })
  const response = await undiciFetch(signedRequest.url, {
    method: "HEAD",
    headers: signedRequest.headers,
  })
  const contentLength = response.headers.get("content-length")
  return {
    ok: response.ok,
    status: response.status,
    contentLength: contentLength === null ? null : Number(contentLength),
    etag: response.headers.get("etag"),
  }
}

export async function deletePrivateObject(key: string): Promise<void> {
  const bucket = process.env.R2_PRIVATE_BUCKET
  if (!bucket) throw new Error("R2_PRIVATE_BUCKET is not configured")

  const signedRequest = await client().sign(objectUrl(bucket, key), { method: "DELETE" })
  const response = await undiciFetch(signedRequest.url, {
    method: "DELETE",
    headers: signedRequest.headers,
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 delete failed: HTTP ${response.status}`)
  }
}
