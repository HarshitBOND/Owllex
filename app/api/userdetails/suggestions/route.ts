import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import Suggestion from "@/app/api/lib/models/suggestion";
import { ensureUser } from "@/app/api/lib/ensureUser";
import { enforceRateLimit, parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards";

const CATEGORY_VALUES = [
  "Case Strategy",
  "Client Management",
  "Practice Management",
  "Legal Research",
  "Compliance",
  "Automation",
  "General",
] as const;

const createSuggestionSchema = z.object({
  title: z.string().trim().min(5).max(180),
  description: z.string().trim().min(20).max(5000),
  category: z.enum(CATEGORY_VALUES),
});

const formatSuggestionForUser = (
  raw: any,
  currentUserId: string,
): Record<string, unknown> => {
  const ratings = Array.isArray(raw.ratingsByUser) ? raw.ratingsByUser : [];
  const currentVote = ratings.find((vote: any) => vote?.clerkUid === currentUserId);

  return {
    _id: String(raw._id),
    title: raw.title,
    description: raw.description,
    category: raw.category,
    status: raw.status,
    adminNotes: raw.clerkUid === currentUserId ? raw.adminNotes || "" : "",
    ratingAverage: Number(raw.ratingAverage || 0),
    ratingCount: Number(raw.ratingCount || 0),
    myRating: currentVote?.value ? Number(currentVote.value) : null,
    isMine: raw.clerkUid === currentUserId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

const parseLimit = (value: string | null) => {
  const parsed = Number(value || "20");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(parsed, 100);
};

export async function GET(request: NextRequest) {
  try {
    const userContext = await requireUserContext();
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const userId = userContext.clerkUid;

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:suggestions:get:${userId}`,
      max: 180,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    await connectMongoWithRetry();

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") || "all").trim();
    const category = (searchParams.get("category") || "all").trim();
    const search = (searchParams.get("search") || "").trim();
    const limit = parseLimit(searchParams.get("limit"));

    const query: Record<string, unknown> = {};

    if (status === "all") {
      query.$or = [{ status: "approved" }, { clerkUid: userId }];
    } else if (status === "approved") {
      query.status = "approved";
    } else if (status === "pending" || status === "rejected") {
      query.status = status;
      query.clerkUid = userId;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$and = [
        {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
          ],
        },
      ];
    }

    const suggestions = await Suggestion.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return NextResponse.json({
      success: true,
      suggestions: suggestions.map((item) => formatSuggestionForUser(item, userId)),
    });
  } catch (error) {
    console.error("Suggestions GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch suggestions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext();
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    const userId = userContext.clerkUid;

    const { blockedResponse } = enforceRateLimit(request, {
      key: `userdetails:suggestions:post:${userId}`,
      max: 30,
      windowMs: 10 * 60 * 1000,
    });

    if (blockedResponse) {
      return blockedResponse;
    }

    const parsed = await parseAndValidateJson(request, createSuggestionSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    await connectMongoWithRetry();
    const user = await ensureUser(userId);

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

    const suggestion = await Suggestion.create({
      clerkUid: userId,
      submitterName: fullName || user?.email || "LexVert User",
      submitterEmail: user?.email || null,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      status: "pending",
      adminNotes: "",
      ratingCount: 0,
      ratingAverage: 0,
      ratingsByUser: [],
    });

    return NextResponse.json({
      success: true,
      suggestion: formatSuggestionForUser(suggestion.toObject(), userId),
    });
  } catch (error) {
    console.error("Suggestions POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit suggestion" },
      { status: 500 },
    );
  }
}
