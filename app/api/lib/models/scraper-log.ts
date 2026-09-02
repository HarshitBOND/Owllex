import mongoose from "mongoose";

const ScraperLogSchema = new mongoose.Schema({
  run_date: { type: Date, default: Date.now },
  pdfs_found: { type: Number, default: 0 },
  pdfs_downloaded: { type: Number, default: 0 },
  pdfs_skipped: { type: Number, default: 0 },
  cases_extracted: { type: Number, default: 0 },
  execution_time_seconds: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["success", "partial", "failed"],
    default: "success",
  },
  error_message: { type: String, default: null },
  results: { type: [mongoose.Schema.Types.Mixed], default: [] },
});

ScraperLogSchema.index({ run_date: -1 });

// One row per nightly run, each carrying a `results` entry per PDF, kept
// forever. Nothing reads a scraper log older than a quarter, so they expire.
ScraperLogSchema.index({ run_date: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const ScraperLog =
  mongoose.models["ScraperLog"] ||
  mongoose.model("ScraperLog", ScraperLogSchema, "scraper_logs");

export default ScraperLog;
