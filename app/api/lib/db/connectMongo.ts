import mongoose from "mongoose";

// Global cache for connection state (survives hot reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    modelsRegistered: boolean;
    lastError: { error: Error; at: number } | null;
  } | undefined;
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = {
    conn: null,
    promise: null,
    modelsRegistered: false,
    lastError: null,
  };
}

let hasSyncedIndexes = false;

const numberFromEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Server selection is what actually detects an unreachable cluster (blocked port,
// missing Atlas IP allowlist entry). Keep it short so requests fail fast instead
// of hanging for a minute and a half before the route gives up.
const SERVER_SELECTION_TIMEOUT_MS = numberFromEnv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", 10000);
const CONNECT_TIMEOUT_MS = numberFromEnv("MONGODB_CONNECT_TIMEOUT_MS", 10000);
const MAX_ATTEMPTS = numberFromEnv("MONGODB_CONNECT_ATTEMPTS", 2);
const RETRY_DELAY_MS = numberFromEnv("MONGODB_CONNECT_RETRY_DELAY_MS", 1000);
// After a failed attempt, short-circuit further calls for a moment so a page that
// fires a dozen parallel requests doesn't queue a dozen more connection attempts.
const FAILURE_COOLDOWN_MS = numberFromEnv("MONGODB_FAILURE_COOLDOWN_MS", 5000);

// No query buffering: every DB entry point awaits connectDB() first, so a query
// reaching a model while the connection is down is a bug, not something to sit on
// for 10s. Failing immediately surfaces the real connection error instead of a
// misleading "buffering timed out" one.
mongoose.set("bufferCommands", false);

const openConnection = async (uri: string): Promise<typeof mongoose> => {
  console.log("Attempting to connect to MongoDB...");

  const conn = await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || "LexVert",
    bufferCommands: false,
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });

  console.log("MongoDB connection successful.");

  // Register all models once per process
  if (!cached!.modelsRegistered) {
    await registerModels();
    cached!.modelsRegistered = true;
  }

  // Optional controlled index sync
  await syncIndexesIfEnabled();

  return conn;
};

const connectMongo = async (
  options?: { ignoreCooldown?: boolean },
): Promise<typeof mongoose> => {
  // If already connected and cached, return immediately
  if (cached!.conn && mongoose.connection.readyState === 1) {
    return cached!.conn;
  }

  if (!cached!.promise) {
    const recentFailure = cached!.lastError;
    if (
      !options?.ignoreCooldown &&
      recentFailure &&
      Date.now() - recentFailure.at < FAILURE_COOLDOWN_MS
    ) {
      throw recentFailure.error;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not defined in environment variables.");
    }

    // A single shared in-flight attempt: concurrent callers await this same
    // promise instead of each opening their own connection.
    cached!.promise = openConnection(uri).catch((error: Error) => {
      cached!.promise = null;
      cached!.conn = null;
      cached!.lastError = { error, at: Date.now() };
      console.error("MongoDB connection error:", error);
      throw error;
    });
  }

  cached!.conn = await cached!.promise;
  cached!.lastError = null;
  return cached!.conn;
};

const registerModels = async () => {
  try {
    // Import all model files in parallel for faster startup
    await Promise.all([
      import("../models/case"),
      import("../models/causelist-cases"),
      import("../models/client"),
      import("../models/invoice"),
      import("../models/note"),
      import("../models/task"),
      import("../models/user"),
      import("../models/notification"),
      import("../models/downloaded-pdf"),
      import("../models/scraped-case"),
      import("../models/scraper-log"),
      import("../models/transaction"),
      import("../models/document"),
      import("../models/admin-log"),
      import("../models/calendar-event"),
      import("../models/support-message"),
      import("../models/complaint"),
      import("../models/fraud-report"),
      import("../models/suggestion"),
      import("../models/simple-invoice"),
      import("../models/firm"),
      import("../models/team-membership"),
      import("../models/job-run"),
      import("../models/document-template"),
      import("../models/draft-document"),
      import("../models/vault-document"),
    ]);

    console.log("All models registered successfully.");
  } catch (error) {
    console.error("Error registering models:", error);
  }
};

const syncIndexesIfEnabled = async () => {
  if (hasSyncedIndexes) {
    return;
  }

  const shouldSyncIndexes = (process.env.MONGO_SYNC_INDEXES || "").trim().toLowerCase() === "true";
  if (!shouldSyncIndexes) {
    return;
  }

  try {
    const criticalModels = [
      "User",
      "Case",
      "Client",
      "Task",
      "SimpleInvoice",
      "Notification",
      "Transaction",
      "ScrapedCase",
      "ScraperLog",
      "DownloadedPDF",
      "Firm",
      "TeamMembership",
      "JobRun",
      "DocumentTemplate",
      "DraftDocument",
    ];

    await Promise.all(
      criticalModels
        .map((modelName) => mongoose.models[modelName])
        .filter(Boolean)
        .map((model) => model!.syncIndexes()),
    );

    hasSyncedIndexes = true;
    console.log("MongoDB indexes synchronized successfully.");
  } catch (error) {
    console.error("MongoDB index sync failed:", error);
  }
};

const describeFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Could not connect to any servers")) {
    return (
      "Could not reach the MongoDB Atlas cluster. Check that this machine's public IP " +
      "is on the cluster's Network Access allowlist and that outbound port 27017 is open."
    );
  }
  return `Failed to connect to MongoDB: ${message}`;
};

const connectMongoWithRetry = async () => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Only the first attempt honours the cooldown; a caller that already waited
      // out its retry delay should get a real attempt, not the cached failure.
      await connectMongo({ ignoreCooldown: attempt > 1 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // The single shared attempt already logged the underlying driver error; callers
  // waiting on it just get the summary so one outage isn't logged once per request.
  throw new Error(describeFailure(lastError));
};

export { connectMongoWithRetry as connectDB };
export default connectMongoWithRetry;
