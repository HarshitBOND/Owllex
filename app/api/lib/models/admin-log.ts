import mongoose from "mongoose";

const AdminLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["user", "transaction", "document", "system", "auth"],
      default: "system",
    },
    targetId: {
      type: String,
      default: null,
    },
    details: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

AdminLogSchema.index({ createdAt: -1 });
AdminLogSchema.index({ adminId: 1, createdAt: -1 });

const AdminLog =
  mongoose.models["AdminLog"] ||
  mongoose.model("AdminLog", AdminLogSchema);

export default AdminLog;
