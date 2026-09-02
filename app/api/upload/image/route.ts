import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards";
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation";
import { logSecurityEvent } from "@/app/api/lib/securityLogger";
import { putPublicObject } from "@/app/api/lib/storage/r2";
import { optimizeImage, withExtension } from "@/app/api/lib/storage/optimizeImage";

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `upload:image:${userContext.clerkUid}`,
      max: 60,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    const formData = await request.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const maxFileSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxFileSizeBytes) {
      return NextResponse.json({ error: "Image size exceeds 10MB" }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const validation = validateUploadBuffer(file.name, new Uint8Array(buffer), file.type);
    if (!validation.ok || validation.resourceType !== "image") {
      logSecurityEvent({
        type: "upload_failed",
        level: "warn",
        message: "Image upload rejected by validation",
        request,
        userId: userContext.clerkUid,
        details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
      });
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    // Downscale + re-encode before storing. These objects are served directly
    // by the public Worker, so whatever lands here is what every viewer pays to
    // download for the lifetime of the image.
    const optimized = await optimizeImage(buffer, file.type);

    const storedName = withExtension(validation.sanitizedFileName!, optimized.extension);
    const key = `public/${userContext.clerkUid}/${randomUUID()}-${storedName}`;
    const url = await putPublicObject(key, optimized.buffer, optimized.contentType);

    return NextResponse.json({
      success: true,
      url,
      originalBytes: optimized.originalBytes,
      storedBytes: optimized.storedBytes,
    });

  } catch (error: any) {
    console.error("Upload error:", error);
    logSecurityEvent({
      type: "upload_failed",
      level: "error",
      message: "Image upload failed with server error",
      request,
      details: { error: String(error?.message || error) },
    });
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}