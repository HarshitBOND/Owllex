import mongoose from "mongoose"

const JobRunSchema = new mongoose.Schema(
  {
    jobName: {
      type: String,
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ["cron", "manual", "api"],
      default: "api",
      index: true,
    },
    status: {
      type: String,
      enum: ["running", "success", "partial", "failed"],
      default: "running",
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    errorMessage: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
)

JobRunSchema.index({ jobName: 1, startedAt: -1 })
JobRunSchema.index({ status: 1, startedAt: -1 })

const JobRun = mongoose.models["JobRun"] || mongoose.model("JobRun", JobRunSchema)

export default JobRun
