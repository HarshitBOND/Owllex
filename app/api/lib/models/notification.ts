import mongoose from "mongoose"

const NotificationSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["hearing-reminder", "calendar-event-reminder"],
      required: true,
      default: "hearing-reminder",
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      default: null,
      index: true,
    },
    calendarEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CalendarEvent",
      default: null,
      index: true,
    },
    caseTitle: {
      type: String,
      required: true,
    },
    hearingDate: {
      type: String,
      required: true,
    },
    reminderWindowDays: {
      type: Number,
      enum: [1, 3, 7],
      required: true,
    },
    resourceType: {
      type: String,
      enum: ["case", "task", "calendar-event"],
      default: "case",
    },
    resourceUrl: {
      type: String,
      default: null,
    },
    channel: {
      type: String,
      enum: ["email"],
      required: true,
      default: "email",
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      required: true,
      default: "pending",
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    emailTo: {
      type: String,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    supportIssueStatus: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true,
    },
    supportIssueNotes: {
      type: String,
      default: "",
    },
    supportIssueHandledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    supportIssueHandledAt: {
      type: Date,
      default: null,
    },
    dedupeKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
)

NotificationSchema.index({ clerkUid: 1, createdAt: -1 })
NotificationSchema.index({ clerkUid: 1, readAt: 1, createdAt: -1 })
NotificationSchema.index({ status: 1, createdAt: 1 })
NotificationSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 })
NotificationSchema.index({ supportIssueStatus: 1, createdAt: -1 })

const Notification =
  mongoose.models["Notification"] || mongoose.model("Notification", NotificationSchema)

export default Notification