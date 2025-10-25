import mongoose from "mongoose";
import path from "path";
import fs from "fs";

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
    await mongoose.connect(uri);
    console.log("MongoDB connection successful.");
    
    // Register all models on first connection
    await registerModels();
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

    console.log("All models registered successfully.");
  } catch (error) {
    console.error("Error registering models:", error);
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