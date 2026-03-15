import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import { ensureUser } from "@/app/api/lib/ensureUser";
import User from "@/app/api/lib/models/user";

const updateAccountPreferencesSchema = z
  .object({
    firstName: z.string().trim().max(120).optional(),
    lastName: z.string().trim().max(120).optional(),
    defaultLandingPage: z
      .enum(["/dashboard", "/case-tracking", "/tasks", "/invoices"])
      .optional(),
    weeklyDigestEnabled: z.boolean().optional(),
    showBillingSummary: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one account preference field is required",
  });

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectMongoWithRetry();
    await ensureUser(userId);

    const userResult = await User.findOne({ clerkUid: userId })
      .select("firstName lastName email accountPreferences")
      .lean()
      .exec();

    const user = (
      Array.isArray(userResult) ? userResult[0] : userResult
    ) as Record<string, unknown> | null;

    return NextResponse.json({
      success: true,
      account: {
        firstName: (user?.firstName as string) || "",
        lastName: (user?.lastName as string) || "",
        email: (user?.email as string) || "",
        accountPreferences: (user?.accountPreferences as Record<string, unknown>) || {
          defaultLandingPage: "/dashboard",
          weeklyDigestEnabled: false,
          showBillingSummary: true,
        },
      },
    });
  } catch (error) {
    console.error("Account settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch account settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectMongoWithRetry();
    await ensureUser(userId);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsedBody = updateAccountPreferencesSchema.safeParse(body);
    if (!parsedBody.success) {
      const firstIssue = parsedBody.error.issues[0]?.message || "Invalid account settings payload";
      return NextResponse.json({ success: false, error: firstIssue }, { status: 400 });
    }

    const updateSet: Record<string, unknown> = {};

    if (typeof parsedBody.data.firstName === "string") {
      updateSet.firstName = parsedBody.data.firstName;
    }

    if (typeof parsedBody.data.lastName === "string") {
      updateSet.lastName = parsedBody.data.lastName;
    }

    if (parsedBody.data.defaultLandingPage) {
      updateSet["accountPreferences.defaultLandingPage"] = parsedBody.data.defaultLandingPage;
    }

    if (typeof parsedBody.data.weeklyDigestEnabled === "boolean") {
      updateSet["accountPreferences.weeklyDigestEnabled"] = parsedBody.data.weeklyDigestEnabled;
    }

    if (typeof parsedBody.data.showBillingSummary === "boolean") {
      updateSet["accountPreferences.showBillingSummary"] = parsedBody.data.showBillingSummary;
    }

    const updatedUserResult = await User.findOneAndUpdate(
      { clerkUid: userId },
      { $set: updateSet },
      { new: true },
    )
      .select("firstName lastName email accountPreferences")
      .lean()
      .exec();

    const updatedUser = (
      Array.isArray(updatedUserResult) ? updatedUserResult[0] : updatedUserResult
    ) as Record<string, unknown> | null;

    if (!updatedUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      account: {
        firstName: (updatedUser.firstName as string) || "",
        lastName: (updatedUser.lastName as string) || "",
        email: (updatedUser.email as string) || "",
        accountPreferences: (updatedUser.accountPreferences as Record<string, unknown>) || {
          defaultLandingPage: "/dashboard",
          weeklyDigestEnabled: false,
          showBillingSummary: true,
        },
      },
    });
  } catch (error) {
    console.error("Account settings PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update account settings" },
      { status: 500 },
    );
  }
}
