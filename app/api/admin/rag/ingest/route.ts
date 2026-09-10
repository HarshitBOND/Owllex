/**
 * POST /api/admin/rag/ingest
 * Admin-only: upload a document, forward it to the backend RAG pipeline
 * (chunk, embed, store in the vector DB) and log the action.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  logAdminAction,
} from "@/app/api/lib/adminMiddleware";
import { enqueueAndAwaitIngest } from "@/app/api/lib/ragIngestPoll";
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation";
import { logSecurityEvent } from "@/app/api/lib/securityLogger";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import PublicDocument from "@/app/api/lib/models/public-document";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "jpg", "jpeg", "png"]);

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const formData = await request.formData();
  const groupFiles = formData.getAll("files").filter((f): f is File => f instanceof File);
  const singleFile = formData.get("file");
  const inputFiles = groupFiles.length > 0 ? groupFiles : singleFile instanceof File ? [singleFile] : [];

  if (inputFiles.length === 0) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  const safeFormData = new FormData();
  let totalBytes = 0;
  let primaryFileName = "";

  for (const [idx, file] of inputFiles.entries()) {
    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);
    const validation = validateUploadBuffer(file.name, buffer, file.type);
    const extension = validation.sanitizedFileName?.split(".").pop()?.toLowerCase() || "";
    const resourceOk = validation.resourceType === "raw" || validation.resourceType === "image";

    if (!validation.ok || !resourceOk || !ALLOWED_EXTENSIONS.has(extension)) {
      logSecurityEvent({
        type: "upload_failed",
        level: "warn",
        message: "RAG ingest upload rejected by validation",
        request,
        userId: admin.userId,
        details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
      });
      return NextResponse.json(
        { success: false, error: "Only PDF, DOCX, TXT, MD, JPG, or PNG files are supported" },
        { status: 400 }
      );
    }

    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Combined document size exceeds the 50MB upload limit" },
        { status: 400 }
      );
    }

    const name =
      inputFiles.length > 1
        ? `${String(idx).padStart(3, "0")}__${validation.sanitizedFileName}`
        : validation.sanitizedFileName!;
    safeFormData.append("files", new File([buffer], name, { type: file.type }));
    if (idx === 0) primaryFileName = validation.sanitizedFileName!;
  }

  try {
    // The backend enqueues onto the ingest worker (the sole FAISS writer,
    // per PRODUCTION_TODO.md T2) and returns a job_id immediately; this waits
    // for it, so the rest of this route sees the same synchronous result it
    // always did.
    let job;
    try {
      job = await enqueueAndAwaitIngest(`${BACKEND_API}/api/v1/rag/ingest`, safeFormData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not enqueue ingestion";
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    if (job.status === "duplicate") {
      return NextResponse.json(
        {
          success: false,
          error: "This document has already been ingested (duplicate content).",
          duplicate: true,
          existingDocumentId: job.document_id,
        },
        { status: 409 }
      );
    }
    if (job.status === "failed") {
      return NextResponse.json(
        { success: false, error: job.error || "Ingestion failed" },
        { status: 500 }
      );
    }

    const data = { success: true, ...job };

    if (data.document_id && data.storage_ref) {
      try {
        await connectMongoWithRetry();
        await PublicDocument.updateOne(
          { documentId: data.document_id },
          {
            $set: {
              title: data.title || primaryFileName,
              documentType: data.document_type || "",
              date: data.date || "",
              sourceUrl: data.source_url || "",
              storageRef: data.storage_ref,
              ingestedByAdminId: admin.dbUserId,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        // The vector store write already succeeded; a catalog miss here means the
        // document just won't be citeable from chat until this is retried, not data loss.
        console.error("PublicDocument catalog upsert failed:", error);
      }
    }

    const pageSuffix = inputFiles.length > 1 ? ` from ${inputFiles.length} pages` : "";
    await logAdminAction(admin.dbUserId, "rag_document_ingested", request, {
      targetType: "document",
      targetId: data.document_id ?? undefined,
      details: `Ingested "${primaryFileName}"${pageSuffix} into RAG pipeline (${data.chunk_count} chunks)`,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("RAG ingest proxy error:", error);
    return NextResponse.json(
      { success: false, error: "RAG ingestion service unavailable" },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};
