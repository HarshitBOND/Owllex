import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards";
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation";
import { logSecurityEvent } from "@/app/api/lib/securityLogger";
import { optimizeImage, withExtension } from "@/app/api/lib/storage/optimizeImage";
import { compressPdf } from "@/app/api/lib/storage/compressPdf";
import { headPrivateObject, putPrivateObject } from "@/app/api/lib/storage/r2";
import { contentAddressedKey } from "@/app/api/lib/storage/dedupe";
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

    const mimeType = file.type || "application/octet-stream";

    // Images are downscaled here; PDFs are recompressed in-process by
    // compressPdf, which runs on Vercel and cannot be silently skipped by a
    // backend being unreachable. compressPdf self-detects non-PDF input and
    // returns it unchanged, so it is safe to call for any non-image file.
    const isImage = validation.resourceType === "image";
    const optimized = isImage ? await optimizeImage(buffer, mimeType) : null;
    const compressed = isImage ? null : await compressPdf(buffer);

    if (compressed && !compressed.compressed) {
      console.warn(
        `[upload] stored file uncompressed (${compressed.reason}): ${buffer.byteLength} bytes, user ${userContext.clerkUid}`
      );
    }

    const storedName = optimized
      ? withExtension(validation.sanitizedFileName!, optimized.extension)
      : validation.sanitizedFileName!;
    const { key: r2Key, exists } = await contentAddressedKey({
      prefix: userContext.clerkUid,
      bytes: buffer,
      filename: storedName,
    });

    const payload = optimized?.buffer ?? compressed?.buffer ?? buffer;
    const payloadMime = optimized?.contentType ?? mimeType;

    let storedBytes = payload.length;
    let storedMime = payloadMime;

    if (exists) {
      const head = await headPrivateObject(r2Key);
      storedBytes = head.contentLength ?? storedBytes;
      storedMime = payloadMime;
    } else {
      await putPrivateObject(r2Key, payload, payloadMime);
    }

    const compressionStatus = optimized
      ? optimized.storedBytes < optimized.originalBytes
        ? "compressed"
        : "unchanged"
      : compressed?.compressed
        ? "compressed"
        : "unchanged";

    await connectMongoWithRetry();
    const attachment = await Attachment.create({
      clerkUid: userContext.clerkUid,
      filename: storedName,
      mimeType: storedMime,
      size: storedBytes,
      r2Key,
      compressionStatus,
      compressionReason: compressed && !compressed.compressed ? compressed.reason : "",
    });

    return NextResponse.json({
      success: true,
      id: attachment._id.toString(),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      compressionApplied: compressionStatus === "compressed",
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