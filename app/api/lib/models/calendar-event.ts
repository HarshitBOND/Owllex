import mongoose from "mongoose"

const CALENDAR_EVENT_SOURCE_TYPES = ["manual", "task", "hearing"] as const
const CALENDAR_EVENT_COLORS = ["blue", "violet", "emerald", "amber", "rose"] as const

const reminderOffsetsValidator = (values: number[]) =>
  Array.isArray(values) && values.every((value) => [1, 3, 7].includes(value))

const CalendarEventSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    color: {
      type: String,
      enum: CALENDAR_EVENT_COLORS,
      default: "blue",
    },
    sourceType: {
      type: String,
      enum: CALENDAR_EVENT_SOURCE_TYPES,
      required: true,
      default: "manual",
      index: true,
    },
    sourceKey: {
      type: String,
      default: null,
      index: true,
    },
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      default: null,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    reminderEnabled: {
      type: Boolean,
      default: false,
    },
    reminderOffsets: {
      type: [Number],
      default: [],
      validate: {
        validator: reminderOffsetsValidator,
        message: "reminderOffsets must use supported day windows",
      },
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

CalendarEventSchema.index({ clerkUid: 1, date: 1, createdAt: 1 })
CalendarEventSchema.index(
  { clerkUid: 1, sourceType: 1, sourceKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceKey: { $type: "string" },
    },
  },
)

const CalendarEvent =
  mongoose.models["CalendarEvent"] || mongoose.model("CalendarEvent", CalendarEventSchema)

export default CalendarEvent
