import mongoose from "mongoose";

const SUGGESTION_CATEGORIES = [
  "Case Strategy",
  "Client Management",
  "Practice Management",
  "Legal Research",
  "Compliance",
  "Automation",
  "General",
] as const;

const SuggestionVoteSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
  },
  { _id: false },
);

const SuggestionSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    submitterName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    submitterEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    category: {
      type: String,
      enum: [...SUGGESTION_CATEGORIES],
      default: "General",
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingsByUser: {
      type: [SuggestionVoteSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

SuggestionSchema.index({ status: 1, createdAt: -1 });
SuggestionSchema.index({ category: 1, createdAt: -1 });
SuggestionSchema.index({ clerkUid: 1, createdAt: -1 });

const Suggestion =
  mongoose.models["Suggestion"] || mongoose.model("Suggestion", SuggestionSchema);

export { SUGGESTION_CATEGORIES };
export default Suggestion;
