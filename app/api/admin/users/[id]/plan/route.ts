/**
 * PATCH /api/admin/users/[id]/plan
 * Manually set a user's subscription plan. Body: { plan: SubscriptionPlan }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";
import { SUBSCRIPTION_PLANS, changeUserSubscriptionPlan } from "@/app/api/lib/services/subscription";
import mongoose from "mongoose";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid user ID format" },
      { status: 400 }
    );
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.plan || !SUBSCRIPTION_PLANS.includes(body.plan as (typeof SUBSCRIPTION_PLANS)[number])) {
    return NextResponse.json(
      { success: false, error: `Field 'plan' must be one of: ${SUBSCRIPTION_PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  await connectMongoWithRetry();

  const targetUser = await User.findById(id);
  if (!targetUser) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 }
    );
  }

  const plan = body.plan as (typeof SUBSCRIPTION_PLANS)[number];
  const previousPlan = targetUser.subscription?.plan || "trial";

  await changeUserSubscriptionPlan(targetUser.clerkUid, plan);

  await logAdminAction(admin.dbUserId, "changed_user_plan", request, {
    targetType: "user",
    targetId: id,
    details: `Changed plan for ${targetUser.email || targetUser.firstName || id}: ${previousPlan} -> ${plan}`,
  });

  return NextResponse.json({
    success: true,
    message: `Plan updated to ${plan}`,
    user: {
      _id: targetUser._id,
      email: targetUser.email,
      plan,
    },
  });
}
