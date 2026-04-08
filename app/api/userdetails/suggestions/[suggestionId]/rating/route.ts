import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Suggestion from "@/app/api/lib/models/suggestion";
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards";

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> },
) {
  try {
    const userContext = await requireUserContext(request);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const userId = userContext.clerkUid;

    const { blockedResponse } = await enforceRateLimit(request, {
      key: `userdetails:suggestions:rating:${userId}`,
      max: 60,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    const { suggestionId } = await params;
    if (!Types.ObjectId.isValid(suggestionId)) {
      return NextResponse.json(
        { success: false, error: "Invalid suggestion id" },
        { status: 400 },
      );
    }

    const parsed = await parseAndValidateJson(request, ratingSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    await connectMongoWithRetry();

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
