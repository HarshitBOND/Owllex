import mongoose from "mongoose";

const AiUsageEventSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true },
    feature: { type: String, required: true },
    modelKey: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cachedInputTokens: { type: Number, default: 0 },
    costPaise: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AiUsageEventSchema.index({ clerkUid: 1, createdAt: -1 });
AiUsageEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AiUsageEvent =
  mongoose.models["AiUsageEvent"] ||
  mongoose.model("AiUsageEvent", AiUsageEventSchema);

export default AiUsageEvent;
