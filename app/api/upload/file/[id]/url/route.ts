import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, objectIdSchema, requireUserContext } from "@/app/api/lib/routeGuards";
import { getPrivateSignedUrl } from "@/app/api/lib/storage/r2";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Attachment from "@/app/api/lib/models/attachment";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userContext = await requireUserContext(request);
  if (userContext instanceof NextResponse) {
    return userContext;
  }

  const { blockedResponse } = await enforceRateLimit(request, {
    key: `upload:sign:${userContext.clerkUid}`,
    max: 60,
    windowMs: 10 * 60 * 1000,
  });
  if (blockedResponse) {
    return blockedResponse;
  }

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectMongoWithRetry();
  const attachment = await Attachment.findById(id);

  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (attachment.clerkUid !== userContext.clerkUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = await getPrivateSignedUrl(attachment.r2Key, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({
    success: true,
    url,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  });
}
