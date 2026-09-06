import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ["trial", "starter", "professional", "enterprise"],
      default: "trial",
    },
    status: {
      type: String,
      enum: ["active", "cancelled", "expired", "past_due", "trial"],
      default: "active",
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    renewalDate: {
      type: Date,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
    },
    stripePriceId: {
      type: String,
      default: null,
    },
    lastPaymentError: {
      type: String,
      default: "",
    },
    aiUsage: {
      periodKey: { type: String, default: "" },
      costPaise: { type: Number, default: 0 },
      researchRuns: { type: Number, default: 0 },
      corpusDocs: { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const notificationOffsetsValidator = (values: number[]) =>
  Array.isArray(values) && values.every((value) => [1, 3, 7].includes(value));

const NotificationPreferencesSchema = new mongoose.Schema(
  {
    emailEnabled: {
      type: Boolean,
      default: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    sendWindowStartHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 8,
    },
    sendWindowEndHour: {
      type: Number,
      min: 1,
      max: 24,
      default: 20,
    },
    reminderOffsets: {
      type: [Number],
      default: [7, 3, 1],
      validate: {
        validator: notificationOffsetsValidator,
        message: "reminderOffsets must use supported day windows",
      },
    },
  },
  { _id: false },
);

const AccountPreferencesSchema = new mongoose.Schema(
  {
    defaultLandingPage: {
      type: String,
      enum: ["/dashboard", "/case-tracking", "/tasks", "/invoices"],
      default: "/dashboard",
    },
    weeklyDigestEnabled: {
      type: Boolean,
      default: false,
    },
    showBillingSummary: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

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
    passwordHash: {
      type: String,
      default: null,
    },
    isBanned: {
      type: Boolean,
      default: false,
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
    role: {
      type: String,
      enum: ["user", "admin", "support"],
      default: "user",
    },
    primaryFirmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Firm",
      default: null,
      index: true,
    },
    firmRole: {
      type: String,
      enum: ["owner", "admin", "member", "viewer", null],
      default: null,
    },
    subscription: {
      type: SubscriptionSchema,
      default: () => ({}),
    },
    notificationPreferences: {
      type: NotificationPreferencesSchema,
      default: () => ({}),
    },
    accountPreferences: {
      type: AccountPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.models["User"] || mongoose.model("User", UserSchema);

export default User;
