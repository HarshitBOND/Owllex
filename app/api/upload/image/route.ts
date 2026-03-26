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

    const validation = validateUploadBuffer(file.name, new Uint8Array(buffer));
    if (!validation.ok || validation.resourceType !== "image") {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    // Convert buffer to base64
    const base64String = buffer.toString("base64");
    const dataURI = `data:image/*;base64,${base64String}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "rich-text-editor", // Optional: organize images
      resource_type: "image",
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
    });

  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}