import Firm from "@/app/api/lib/models/firm"
import TeamMembership, { TEAM_ROLES, type TeamRole } from "@/app/api/lib/models/team-membership"

export const TEAM_PERMISSIONS = [
  "firm.manage",
  "team.manage",
  "case.read",
  "case.write",
  "client.read",
  "client.write",
  "task.read",
  "task.write",
  "invoice.read",
  "invoice.write",
  "dashboard.read",
] as const

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number]

type PermissionMatrix = Record<TeamRole, TeamPermission[]>

const PERMISSION_MATRIX: PermissionMatrix = {
  owner: [...TEAM_PERMISSIONS],
  admin: [
    "team.manage",
    "case.read",
    "case.write",
    "client.read",
    "client.write",
    "task.read",
    "task.write",
    "invoice.read",
    "invoice.write",
    "dashboard.read",
  ],
  member: [
    "case.read",
    "case.write",
    "client.read",
    "client.write",
    "task.read",
    "task.write",
    "invoice.read",
    "invoice.write",
    "dashboard.read",
  ],
  viewer: ["case.read", "client.read", "task.read", "invoice.read", "dashboard.read"],
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && TEAM_ROLES.includes(value as TeamRole)
}

export function hasTeamPermission(role: TeamRole, permission: TeamPermission) {
  return PERMISSION_MATRIX[role].includes(permission)
}

export async function getFirmMembership(clerkUid: string, firmId: string) {
  const membership = (await TeamMembership.findOne({
    clerkUid,
    firmId,
    status: "active",
  })
    .select("firmId clerkUid role status")
    .lean()
    .exec()) as any

  if (!membership || !membership.firmId) {
    return null
  }

  return {
    firmId: membership.firmId.toString(),
    clerkUid: membership.clerkUid,
    role: membership.role as TeamRole,
    status: membership.status,
  }
}

export async function canAccessFirm(clerkUid: string, firmId: string, permission: TeamPermission) {
  const membership = await getFirmMembership(clerkUid, firmId)
  if (!membership) {
    return {
      allowed: false,
      reason: "Not a member of this firm",
      membership: null,
      firm: null,
    }
  }

  if (!hasTeamPermission(membership.role, permission)) {
    return {
      allowed: false,
      reason: `Role ${membership.role} cannot ${permission}`,
      membership,
      firm: null,
    }
  }

  const firm = await Firm.findById(firmId).select("_id name slug isActive ownerClerkUid").lean().exec()

  if (!firm || !(firm as any).isActive) {
    return {
      allowed: false,
      reason: "Firm is unavailable",
      membership,
      firm: null,
    }
  }

  return {
    allowed: true,
    reason: null,
    membership,
    firm: {
      id: (firm as any)._id.toString(),
      name: (firm as any).name,
      slug: (firm as any).slug,
      ownerClerkUid: (firm as any).ownerClerkUid,
    },
  }
}
