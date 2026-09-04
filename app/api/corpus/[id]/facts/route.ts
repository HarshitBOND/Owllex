import { NextRequest, NextResponse } from "next/server"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import Corpus from "@/app/api/lib/models/corpus"
import CorpusFact from "@/app/api/lib/models/corpus-fact"
import { forgetFacts, syncFactSheet } from "@/app/api/lib/services/corpusFacts"

/**
 * What this corpus has remembered, and how to make it forget.
 *
 * These are a client's personal details -- names, parentage, addresses -- so
 * they have to be visible and removable, not merely collected. Every route here
 * is scoped to the caller's own corpus.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id: corpusId } = await params

  await connectMongoWithRetry()
  if (!(await Corpus.exists({ clerkUid: userContext.clerkUid, corpusId }))) {
    return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })
  }

  const rows = await CorpusFact.find({
    clerkUid: userContext.clerkUid,
    corpusId,
    supersededAt: null,
  })
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean()

  return NextResponse.json({
    success: true,
    facts: rows.map((r) => ({
      id: String(r._id),
      key: r.key,
      label: r.label,
      value: r.value,
      sourceType: r.sourceType,
      updatedAt: r.updatedAt,
    })),
  })
}

/** Removes one remembered detail, or all of them with `?all=true`. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userContext = await requireUserContext(request)
  if (userContext instanceof NextResponse) return userContext

  const { id: corpusId } = await params
  const { searchParams } = new URL(request.url)
  const all = searchParams.get("all") === "true"
  const factId = searchParams.get("factId")

  await connectMongoWithRetry()
  if (!(await Corpus.exists({ clerkUid: userContext.clerkUid, corpusId }))) {
    return NextResponse.json({ success: false, error: "Corpus not found" }, { status: 404 })
  }

  if (all) {
    const { deleted } = await forgetFacts({ clerkUid: userContext.clerkUid, corpusId })
    return NextResponse.json({
      success: true,
      deleted,
      message:
        deleted === 0
          ? "There was nothing remembered for this corpus."
          : `Forgot ${deleted} remembered ${deleted === 1 ? "detail" : "details"}. Documents already drafted are unaffected.`,
    })
  }

  if (!factId) {
    return NextResponse.json(
      { success: false, error: "Say which detail to forget, or pass all=true." },
      { status: 400 }
    )
  }

  const result = await CorpusFact.deleteOne({
    _id: factId,
    clerkUid: userContext.clerkUid,
    corpusId,
  })
  if (result.deletedCount === 0) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  }

  // The indexed sheet has to lose it too, or a forgotten detail keeps coming
  // back through search.
  await syncFactSheet({ clerkUid: userContext.clerkUid, corpusId })

  return NextResponse.json({ success: true, deleted: 1 })
}
