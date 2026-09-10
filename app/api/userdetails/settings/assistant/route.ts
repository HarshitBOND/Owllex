import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import { parseAndValidateJson, requireUserContext } from "@/app/api/lib/routeGuards";
import User from "@/app/api/lib/models/user";
import {
  assistantSelectOptions,
  assistantToggleKeys,
  defaultAssistantChoices,
  defaultAssistantToggles,
} from "@/features/settings/data/assistantSections";

const updateAssistantPreferencesSchema = z
  .object({
    choices: z.record(z.string(), z.string()).optional(),
    toggles: z.record(z.string(), z.boolean()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one of choices or toggles is required",
  });

/** Drops unknown keys and out-of-range values rather than rejecting the whole request. */
function sanitizeChoices(choices: Record<string, string> | undefined) {
  if (!choices) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(choices)) {
    if (assistantSelectOptions[key]?.includes(value)) {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeToggles(toggles: Record<string, boolean> | undefined) {
  if (!toggles) return {};
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(toggles)) {
    if (assistantToggleKeys.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

function mapToObject(value: unknown): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

export async function GET() {
  try {
    const userContext = await requireUserContext(undefined);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    await connectMongoWithRetry();

    const userResult = await User.findOne({ clerkUid: userContext.clerkUid })
      .select("assistantPreferences")
      .lean()
      .exec();

    const user = (
      Array.isArray(userResult) ? userResult[0] : userResult
    ) as Record<string, unknown> | null;

    const stored = (user?.assistantPreferences as Record<string, unknown>) || {};

    return NextResponse.json({
      success: true,
      preferences: {
        choices: { ...defaultAssistantChoices, ...mapToObject(stored.choices) },
        toggles: { ...defaultAssistantToggles, ...mapToObject(stored.toggles) },
      },
    });
  } catch (error) {
    console.error("Assistant settings GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch assistant settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request);
    if (userContext instanceof NextResponse) {
      return userContext;
    }

    await connectMongoWithRetry();

    const parsedBody = await parseAndValidateJson(request, updateAssistantPreferencesSchema);
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const choices = sanitizeChoices(parsedBody.data.choices);
    const toggles = sanitizeToggles(parsedBody.data.toggles);

    const updateSet: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(choices)) {
      updateSet[`assistantPreferences.choices.${key}`] = value;
    }
    for (const [key, value] of Object.entries(toggles)) {
      updateSet[`assistantPreferences.toggles.${key}`] = value;
    }

    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid assistant preference fields were provided" },
        { status: 400 },
      );
    }

    const updatedUserResult = await User.findOneAndUpdate(
      { clerkUid: userContext.clerkUid },
      { $set: updateSet },
      { new: true, upsert: false },
    )
      .select("assistantPreferences")
      .lean()
      .exec();

    const updatedUser = (
      Array.isArray(updatedUserResult) ? updatedUserResult[0] : updatedUserResult
    ) as Record<string, unknown> | null;

    if (!updatedUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const stored = (updatedUser.assistantPreferences as Record<string, unknown>) || {};

    return NextResponse.json({
      success: true,
      preferences: {
        choices: { ...defaultAssistantChoices, ...mapToObject(stored.choices) },
        toggles: { ...defaultAssistantToggles, ...mapToObject(stored.toggles) },
      },
    });
  } catch (error) {
    console.error("Assistant settings PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update assistant settings" },
      { status: 500 },
    );
  }
}
