import mongoose from "mongoose";

let hasSyncedIndexes = false;

const connectMongo = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log("MongoDB is already connected.");
      return mongoose.connection.asPromise();
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not defined in environment variables.");
    }

    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || "LexVert",
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    console.log("MongoDB connection successful.");
    
    // Register all models on first connection
    await registerModels();

    // Optional controlled index sync for production hardening.
    // Enable only when intentionally auditing/updating indexes.
    await syncIndexesIfEnabled();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

const registerModels = async () => {
  try {
    
    // Import all your model files
    await import("../models/case");
    await import("../models/causelist-cases");
    await import("../models/client");
    await import("../models/invoice");
    await import("../models/note");
    await import("../models/task");
    await import("../models/user");
    await import("../models/notification");
    await import("../models/downloaded-pdf");
    await import("../models/scraped-case");
    await import("../models/scraper-log");
    await import("../models/transaction");
    await import("../models/document");
    await import("../models/admin-log");
    await import("../models/calendar-event");
    await import("../models/support-message");
    await import("../models/complaint");
    await import("../models/fraud-report");
    await import("../models/suggestion");
    await import("../models/simple-invoice");
    await import("../models/firm");
    await import("../models/team-membership");
    await import("../models/job-run");

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