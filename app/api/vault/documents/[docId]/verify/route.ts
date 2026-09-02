import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards"
import { getPrivateObject, headPrivateObject } from "@/app/api/lib/storage/r2"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import VaultDocument from "@/app/api/lib/models/vault-document"

/**
 * Confirms a vault document is still intact in R2.
 *
 * Two depths, because the honest check is expensive:
 *   quick (default) -- a HEAD on the object. Proves it still exists and is
 *     still the right number of bytes. Costs one request and no transfer, so
 *     the "Verify all" sweep can run over a whole 200-document vault.
 *   deep (?deep=1)  -- re-downloads the object and recomputes its SHA-256.
 *     This is the only check that catches same-size corruption, but it pulls
 *     up to 25 MB into this function, so it is rate limited far more tightly.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const deep = request.nextUrl.searchParams.get("deep") === "1"

  const { blockedResponse } = await enforceRateLimit(
    request,
    deep
      ? { key: `vault:verify:deep:${userContext.clerkUid}`, max: 5, windowMs: 60 * 60 * 1000 }
      : { key: `vault:verify:${userContext.clerkUid}`, max: 300, windowMs: 10 * 60 * 1000 }
  )
  if (blockedResponse) return blockedResponse

  const { docId } = await params
  if (!objectIdSchema.safeParse(docId).success) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 })
  }

  await connectMongoWithRetry()
  const doc = await VaultDocument.findOne({ _id: docId, clerkUid: userContext.clerkUid })
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 })

  const missing = async () => {
    doc.verifyStatus = "missing"
    doc.lastVerifiedAt = new Date()
    await doc.save()
    return NextResponse.json({
      success: true,
      depth: deep ? "deep" : "quick",
      verifyStatus: doc.verifyStatus,
      lastVerifiedAt: doc.lastVerifiedAt.getTime(),
      message: "This document could not be found in secure storage.",
    })
  }

  if (!deep) {
    const head = await headPrivateObject(doc.r2Key)
    if (!head.ok) return missing()

    // A size change is the only tampering a HEAD can see. Same-size corruption
    // needs the deep check, so a passing quick check reports "present", never
    // "verified" -- it has not looked at a single byte.
    const sizeMatches = head.contentLength === null || head.contentLength === doc.size
    doc.verifyStatus = sizeMatches ? "present" : "corrupted"
    doc.lastVerifiedAt = new Date()
    await doc.save()

    return NextResponse.json({
      success: true,
      depth: "quick",
      verifyStatus: doc.verifyStatus,
      sha256: doc.sha256,
      lastVerifiedAt: doc.lastVerifiedAt.getTime(),
      message: sizeMatches
        ? `Present in secure storage at the expected ${doc.size} bytes. Run a full check to confirm the hash.`
        : `Size mismatch — storage holds ${head.contentLength} bytes, not the original ${doc.size}.`,
    })
  }

  const object = await getPrivateObject(doc.r2Key)
  if (!object.ok || !object.body) return missing()

  const currentHash = createHash("sha256").update(object.body).digest("hex")
  const matches = currentHash === doc.sha256
  doc.verifyStatus = matches ? "verified" : "corrupted"
  doc.lastVerifiedAt = new Date()
  await doc.save()

  return NextResponse.json({
    success: true,
    depth: "deep",
    verifyStatus: doc.verifyStatus,
    sha256: doc.sha256,
    currentHash,
    lastVerifiedAt: doc.lastVerifiedAt.getTime(),
    message: matches
      ? "Integrity confirmed — the stored file matches its SHA-256 hash."
      : "Hash mismatch — the stored file's contents differ from the recorded hash.",
  })
}
