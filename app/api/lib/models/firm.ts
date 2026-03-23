import mongoose from "mongoose"

const FirmSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    ownerClerkUid: {
      type: String,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    settings: {
      timezone: {
        type: String,
        default: "Asia/Kolkata",
      },
      enforceMfa: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  },
)

FirmSchema.index({ ownerClerkUid: 1, createdAt: -1 })

const Firm = mongoose.models["Firm"] || mongoose.model("Firm", FirmSchema)

export default Firm
