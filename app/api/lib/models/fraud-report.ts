import mongoose from "mongoose";

const FraudReportSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      default: null,
      index: true,
    },
    source: {
      type: String,
      enum: ["report-fraud", "other"],
      default: "report-fraud",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
      index: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },
    incidentTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    incidentDetails: {
      type: String,
      required: true,
      trim: true,
      maxlength: 6000,
    },
    incidentDate: {
      type: Date,
      default: null,
    },
    caseReference: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
      index: true,
    },
    amountInvolved: {
      type: Number,
      default: null,
      min: 0,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    evidenceUrls: {
      type: [String],
      default: [],
      validate: {
        validator: (value: unknown) =>
          Array.isArray(value) && value.every((entry) => typeof entry === "string"),
        message: "evidenceUrls must be an array of strings",
      },
    },
    status: {
      type: String,
      enum: ["new", "under_review", "investigating", "resolved", "dismissed"],
      default: "new",
      index: true,
    },
    resolutionNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    handledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

FraudReportSchema.index({ status: 1, createdAt: -1 });
FraudReportSchema.index({ priority: 1, createdAt: -1 });

const FraudReport =
  mongoose.models["FraudReport"] || mongoose.model("FraudReport", FraudReportSchema);

export default FraudReport;
