import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Suggestion from "@/app/api/lib/models/suggestion";
import { ensureUser } from "@/app/api/lib/ensureUser";

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { suggestionId } = await params;
    if (!Types.ObjectId.isValid(suggestionId)) {
      return NextResponse.json(
        { success: false, error: "Invalid suggestion id" },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = ratingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "rating must be between 1 and 5" },
        { status: 400 },
      );
    }

    await connectMongoWithRetry();
    await ensureUser(userId);

    const suggestion = await Suggestion.findOne({
      _id: suggestionId,
      status: "approved",
    });

    if (!suggestion) {
      return NextResponse.json(
        { success: false, error: "Suggestion not found or not available for rating" },
        { status: 404 },
      );
    }

    const ratingValue = parsed.data.rating;
    const currentRatings = Array.isArray(suggestion.ratingsByUser)
      ? [...suggestion.ratingsByUser]
      : [];

    const existingIndex = currentRatings.findIndex((item: any) => item?.clerkUid === userId);
    if (existingIndex >= 0) {
      currentRatings[existingIndex].value = ratingValue;
    } else {
      currentRatings.push({ clerkUid: userId, value: ratingValue });
    }

    const totalRating = currentRatings.reduce((sum: number, item: any) => {
      return sum + (Number(item?.value) || 0);
    }, 0);

    suggestion.ratingsByUser = currentRatings;
    suggestion.ratingCount = currentRatings.length;
    suggestion.ratingAverage = currentRatings.length
      ? Number((totalRating / currentRatings.length).toFixed(2))
      : 0;

    await suggestion.save();

    return NextResponse.json({
      success: true,
      suggestion: {
        _id: String(suggestion._id),
        ratingAverage: suggestion.ratingAverage,
        ratingCount: suggestion.ratingCount,
        myRating: ratingValue,
      },
    });
  } catch (error) {
    console.error("Suggestion rating POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit suggestion rating" },
      { status: 500 },
    );
  }
}
