import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: { type: String, required: true, enum: ["user", "assistant", "system"] },
    parts: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConversationSchema = new mongoose.Schema(
  {
    clerkUid: { type: String, required: true, index: true },
    chatId: { type: String, required: true },
    corpusId: { type: String, default: null },
    title: { type: String, required: true },
    model: { type: String },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true }
);

ConversationSchema.index({ clerkUid: 1, chatId: 1 }, { unique: true });
ConversationSchema.index({ clerkUid: 1, updatedAt: -1 });
ConversationSchema.index({ clerkUid: 1, corpusId: 1, updatedAt: -1 });

const Conversation =
  mongoose.models["Conversation"] ||
  mongoose.model("Conversation", ConversationSchema);

export default Conversation;
