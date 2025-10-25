import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    clerkUid: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    email: {
      type: String,
      required: false,
      default: null,
    },
    cases: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Case",
        }
      ],
      default: [],
    },
    clients: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Client",
        }
      ],
      default: [],
    },
    signupDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastLogin: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.models["User"] || mongoose.model("User", UserSchema);

export default User;
