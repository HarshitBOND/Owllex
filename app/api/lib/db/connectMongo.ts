import mongoose from "mongoose";

// Global cache for connection state (survives hot reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    modelsRegistered: boolean;
  } | undefined;
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = {
    conn: null,
    promise: null,
    modelsRegistered: false,
  };
}

let hasSyncedIndexes = false;

const connectMongo = async (): Promise<typeof mongoose> => {
  // If already connected and cached, return immediately
  if (cached!.conn && mongoose.connection.readyState === 1) {
    return cached!.conn;
  }

  // If connection is in progress, wait for it
  if (cached!.promise) {
    try {
      cached!.conn = await cached!.promise;
      return cached!.conn;
    } catch {
      // If the cached promise failed, reset and try again
      cached!.promise = null;
    }
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  console.log("Attempting to connect to MongoDB...");

  cached!.promise = mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || "LexVert",
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    serverSelectionTimeoutMS: 30000,
  });

  try {
    cached!.conn = await cached!.promise;
    console.log("MongoDB connection successful.");

    // Register all models once per process
    if (!cached!.modelsRegistered) {
      await registerModels();
      cached!.modelsRegistered = true;
    }

    // Optional controlled index sync
    await syncIndexesIfEnabled();

    return cached!.conn;
  } catch (error) {
    // Reset cache on failure so next call can retry
    cached!.promise = null;
    cached!.conn = null;
    console.error("MongoDB connection error:", error);
    throw error;
  }
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

const connectMongoWithRetry = async () => {
  let tries = 0;
  const maxRetries = 3;
  const retryDelay = 3000; // Delay in milliseconds (3 seconds)

  while (tries < maxRetries) {
    try {
      await connectMongo();
      return; // Exit once the connection is successful
    } catch (error) {
      tries++;
      console.error(`Retrying MongoDB connection (${tries}/${maxRetries})...`);
      if (tries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        console.error("All retry attempts failed.");
        throw new Error(
          "Failed to connect to MongoDB after multiple attempts.",
        );
      }
    }
  }
};

export default connectMongoWithRetry;