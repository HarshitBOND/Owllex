import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { enforceRateLimit, requireUserContext } from "@/app/api/lib/routeGuards";
import { validateUploadBuffer } from "@/app/api/lib/uploadValidation";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext();
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

    const validation = validateUploadBuffer(file.name, new Uint8Array(buffer));
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error || "Unsupported file" }, { status: 400 });
    }

    // Convert buffer to base64
    const base64String = buffer.toString("base64");
    const dataURI = `data:application/octet-stream;base64,${base64String}`;

    // Upload to Cloudinary with resource type detection
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "file-uploads", 
      resource_type: validation.resourceType || "raw",
      use_filename: true,
      unique_filename: true,
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      bytes: result.bytes,
    });

  } catch (error: any) {
    console.error("Upload error:", error);
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