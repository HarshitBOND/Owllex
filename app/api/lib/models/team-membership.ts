import mongoose from "mongoose"

export const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

const TeamMembershipSchema = new mongoose.Schema(
  {
    firmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Firm",
      required: true,
      index: true,
    },
    clerkUid: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: TEAM_ROLES,
      default: "member",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "invited", "suspended"],
      default: "active",
      index: true,
    },
    invitedByClerkUid: {
      type: String,
      default: null,
    },
    lastRoleUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

TeamMembershipSchema.index({ firmId: 1, clerkUid: 1 }, { unique: true })
TeamMembershipSchema.index({ clerkUid: 1, status: 1, updatedAt: -1 })

const TeamMembership =
  mongoose.models["TeamMembership"] || mongoose.model("TeamMembership", TeamMembershipSchema)

export default TeamMembership
