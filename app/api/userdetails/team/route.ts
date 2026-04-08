import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectMongoWithRetry from "@/app/api/lib/db/connectMongo"
import { requireUserContext } from "@/app/api/lib/routeGuards"
import { ensureUser } from "@/app/api/lib/ensureUser"
import Firm from "@/app/api/lib/models/firm"
import TeamMembership, { type TeamRole } from "@/app/api/lib/models/team-membership"
import { canAccessFirm, isTeamRole, TEAM_PERMISSIONS, type TeamPermission } from "@/app/api/lib/services/rbac"
import User from "@/app/api/lib/models/user"

const createFirmSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "Slug can only use lowercase letters, numbers, and hyphens")
    .optional(),
})

const manageMemberSchema = z.object({
  action: z.enum(["add-member", "update-role", "remove-member"]),
  firmId: z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid firm id"),
  targetClerkUid: z.string().trim().min(3).max(128),
  role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
})

const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)

const ensureUniqueSlug = async (baseSlug: string) => {
  let candidate = baseSlug
  let sequence = 1

  while (await Firm.exists({ slug: candidate })) {
    candidate = `${baseSlug}-${sequence}`
    sequence += 1
  }

  return candidate
}

const listFirmMembers = async (firmId: string) => {
  const members = await TeamMembership.find({ firmId, status: { $ne: "suspended" } })
    .select("clerkUid role status updatedAt")
    .sort({ role: 1, updatedAt: -1 })
    .lean()
    .exec()

  return (members as any[]).map((member) => ({
    clerkUid: member.clerkUid,
    role: member.role,
    status: member.status,
    updatedAt: member.updatedAt,
    permissions: TEAM_PERMISSIONS.filter((permission) => {
      const role = member.role as TeamRole
      if (role === "owner") return true
      if (role === "admin") return permission !== "firm.manage"
      if (role === "member") return !permission.endsWith("manage")
      return permission.endsWith("read")
    }),
  }))
}

export async function GET() {
  try {
    const userContext = await requireUserContext(undefined)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    await connectMongoWithRetry()
    await ensureUser(userContext.clerkUid)

    const memberships = await TeamMembership.find({
      clerkUid: userContext.clerkUid,
      status: "active",
    })
      .populate({
        path: "firmId",
        select: "name slug ownerClerkUid isActive createdAt updatedAt",
      })
      .lean()
      .exec()

    const firms = (memberships as any[])
      .filter((membership) => membership.firmId)
      .map((membership) => ({
        firmId: membership.firmId._id.toString(),
        name: membership.firmId.name,
        slug: membership.firmId.slug,
        role: membership.role,
        status: membership.status,
        isActive: membership.firmId.isActive,
        ownerClerkUid: membership.firmId.ownerClerkUid,
      }))

    return NextResponse.json({
      success: true,
      firms,
    })
  } catch (error) {
    console.error("Team GET error:", error)
    return NextResponse.json({ success: false, error: "Failed to load team data" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const body = (await request.json().catch(() => null)) as unknown
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = createFirmSchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid firm payload"
      return NextResponse.json({ success: false, error: issue }, { status: 400 })
    }

    await connectMongoWithRetry()

    const slugSeed = normalizeSlug(parsed.data.slug || parsed.data.name)
    if (!slugSeed) {
      return NextResponse.json({ success: false, error: "Could not generate a valid firm slug" }, { status: 400 })
    }

    const slug = await ensureUniqueSlug(slugSeed)

    const firm = await Firm.create({
      name: parsed.data.name,
      slug,
      ownerClerkUid: userContext.clerkUid,
      isActive: true,
    })

    await TeamMembership.create({
      firmId: firm._id,
      clerkUid: userContext.clerkUid,
      role: "owner",
      status: "active",
      invitedByClerkUid: userContext.clerkUid,
      lastRoleUpdatedAt: new Date(),
    })

    await User.updateOne(
      { clerkUid: userContext.clerkUid },
      {
        $set: {
          primaryFirmId: firm._id,
          firmRole: "owner",
        },
      },
    ).exec()

    const members = await listFirmMembers(firm._id.toString())

    return NextResponse.json(
      {
        success: true,
        firm: {
          id: firm._id.toString(),
          name: firm.name,
          slug: firm.slug,
          ownerClerkUid: firm.ownerClerkUid,
        },
        members,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Team POST error:", error)
    return NextResponse.json({ success: false, error: "Failed to create firm" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userContext = await requireUserContext(request)
    if (userContext instanceof NextResponse) {
      return userContext
    }

    const body = (await request.json().catch(() => null)) as unknown
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = manageMemberSchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || "Invalid member payload"
      return NextResponse.json({ success: false, error: issue }, { status: 400 })
    }

    await connectMongoWithRetry()

    const permissionCheck = await canAccessFirm(
      userContext.clerkUid,
      parsed.data.firmId,
      "team.manage" as TeamPermission,
    )

    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { success: false, error: permissionCheck.reason || "Forbidden" },
        { status: 403 },
      )
    }

    if (parsed.data.action === "add-member") {
      const role = parsed.data.role || "member"
      if (!isTeamRole(role)) {
        return NextResponse.json({ success: false, error: "Invalid team role" }, { status: 400 })
      }

      await ensureUser(parsed.data.targetClerkUid)

      await TeamMembership.updateOne(
        {
          firmId: parsed.data.firmId,
          clerkUid: parsed.data.targetClerkUid,
        },
        {
          $set: {
            role,
            status: "active",
            invitedByClerkUid: userContext.clerkUid,
            lastRoleUpdatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true },
      ).exec()

      await User.updateOne(
        {
          clerkUid: parsed.data.targetClerkUid,
          $or: [{ primaryFirmId: null }, { primaryFirmId: { $exists: false } }],
        },
        {
          $set: {
            primaryFirmId: parsed.data.firmId,
            firmRole: role,
          },
        },
      ).exec()
    }

    if (parsed.data.action === "update-role") {
      if (!parsed.data.role || !isTeamRole(parsed.data.role)) {
        return NextResponse.json({ success: false, error: "Role is required" }, { status: 400 })
      }

      const targetMembership = await TeamMembership.findOne({
        firmId: parsed.data.firmId,
        clerkUid: parsed.data.targetClerkUid,
      })
        .select("_id role")
        .lean()
        .exec()

      if (!targetMembership) {
        return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 })
      }

      await TeamMembership.updateOne(
        {
          firmId: parsed.data.firmId,
          clerkUid: parsed.data.targetClerkUid,
        },
        {
          $set: {
            role: parsed.data.role,
            lastRoleUpdatedAt: new Date(),
          },
        },
      ).exec()

      await User.updateOne(
        { clerkUid: parsed.data.targetClerkUid },
        {
          $set: {
            firmRole: parsed.data.role,
          },
        },
      ).exec()
    }

    if (parsed.data.action === "remove-member") {
      await TeamMembership.deleteOne({
        firmId: parsed.data.firmId,
        clerkUid: parsed.data.targetClerkUid,
      }).exec()
    }

    const members = await listFirmMembers(parsed.data.firmId)

    return NextResponse.json({
      success: true,
      members,
    })
  } catch (error) {
    console.error("Team PATCH error:", error)
    return NextResponse.json({ success: false, error: "Failed to update team membership" }, { status: 500 })
  }
}
