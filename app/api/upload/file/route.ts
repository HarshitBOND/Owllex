import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards";
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation";
import { logSecurityEvent } from "@/app/api/lib/securityLogger";
import { putPrivateObject } from "@/app/api/lib/storage/r2";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Attachment from "@/app/api/lib/models/attachment";

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `upload:file:${userContext.clerkUid}`,
      max: 40,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const maxFileSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxFileSizeBytes) {
      return NextResponse.json({ error: "File size exceeds 10MB" }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const validation = validateUploadBuffer(file.name, new Uint8Array(buffer), file.type);
    if (!validation.ok) {
      logSecurityEvent({
        type: "upload_failed",
        level: "warn",
        message: "File upload rejected by validation",
        request,
        userId: userContext.clerkUid,
        details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
      });
      return NextResponse.json({ error: validation.error || "Unsupported file" }, { status: 400 });
    }

    const r2Key = `${userContext.clerkUid}/${randomUUID()}-${validation.sanitizedFileName}`;
    await putPrivateObject(r2Key, buffer, file.type || "application/octet-stream");

    await connectMongoWithRetry();
    const attachment = await Attachment.create({
      clerkUid: userContext.clerkUid,
      filename: validation.sanitizedFileName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      r2Key,
    });

    return NextResponse.json({
      success: true,
      id: attachment._id.toString(),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    });

  } catch (error: any) {
    console.error("Upload error:", error);
    logSecurityEvent({
      type: "upload_failed",
      level: "error",
      message: "File upload failed with server error",
      request,
      details: { error: String(error?.message || error) },
    });
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

// Optional: Add file size limit
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Adjust as needed
    },
  },
}