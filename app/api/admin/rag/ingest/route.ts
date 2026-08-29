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
import { getBackendInternalHeaders } from "@/app/api/lib/backendInternalAuth";
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation";
import { logSecurityEvent } from "@/app/api/lib/securityLogger";

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || "http://localhost:8000";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md"]);

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = new Uint8Array(bytes);
  const validation = validateUploadBuffer(file.name, buffer, file.type);
  const extension = validation.sanitizedFileName?.split(".").pop()?.toLowerCase() || "";

  if (!validation.ok || validation.resourceType !== "raw" || !ALLOWED_EXTENSIONS.has(extension)) {
    logSecurityEvent({
      type: "upload_failed",
      level: "warn",
      message: "RAG ingest upload rejected by validation",
      request,
      userId: admin.userId,
      details: { reason: validation.error, originalFileName: file.name, mimeType: file.type },
    });
    return NextResponse.json(
      { success: false, error: "Only PDF, DOCX, TXT, or MD files are supported" },
      { status: 400 }
    );
  }

  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { success: false, error: "File exceeds 50MB upload limit" },
      { status: 400 }
    );
  }

  const safeFormData = new FormData();
  safeFormData.append("file", new File([buffer], validation.sanitizedFileName!, { type: file.type }));

  try {
    const response = await fetch(`${BACKEND_API}/api/v1/rag/ingest`, {
      method: "POST",
      headers: getBackendInternalHeaders(),
      body: safeFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || "Ingestion failed" },
        { status: response.status }
      );
    }

    await logAdminAction(admin.dbUserId, "rag_document_ingested", request, {
      targetType: "document",
      targetId: data.document_id,
      details: `Ingested "${validation.sanitizedFileName}" into RAG pipeline (${data.chunk_count} chunks)`,
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
