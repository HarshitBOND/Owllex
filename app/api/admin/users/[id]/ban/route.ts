/**
 * PATCH /api/admin/users/[id]/ban
 * Ban or unban a user. Body: { banned: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/app/api/lib/adminMiddleware";
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo";
import User from "@/app/api/lib/models/user";
import mongoose from "mongoose";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid user ID format" },
      { status: 400 }
    );
  }

  let body: { banned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (typeof body.banned !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Field 'banned' must be a boolean" },
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

  // Prevent banning yourself
  if (targetUser.clerkUid === admin.userId) {
    return NextResponse.json(
      { success: false, error: "Cannot ban your own admin account" },
      { status: 400 }
    );
  }

  // Prevent banning other admins
  if (targetUser.role === "admin" && body.banned) {
    return NextResponse.json(
      { success: false, error: "Cannot ban another admin. Demote first." },
      { status: 400 }
    );
  }

  targetUser.isBanned = body.banned;
  await targetUser.save();

  await logAdminAction(admin.dbUserId, body.banned ? "banned_user" : "unbanned_user", request, {
    targetType: "user",
    targetId: id,
    details: `${body.banned ? "Banned" : "Unbanned"} user: ${targetUser.email || targetUser.firstName || id}`,
  });

  return NextResponse.json({
    success: true,
    message: body.banned ? "User has been banned" : "User has been unbanned",
    user: {
      _id: targetUser._id,
      email: targetUser.email,
      isBanned: targetUser.isBanned,
    },
  });
}
