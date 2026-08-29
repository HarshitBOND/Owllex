import { AwsClient } from "aws4fetch"

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
  const response = await client().fetch(objectUrl(bucket, key), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "Content-Type": contentType },
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
