import mongoose from "mongoose";

const PdfTrackingSchema = new mongoose.Schema({
  last_processed_pdf_url: { type: String, default: "" },
  last_processed_timestamp: { type: Date, default: null },
  source: { type: String, default: "cause_list" },
  checkpoint_identifier: { type: String, default: "" },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const PdfTracking =
  mongoose.models["PdfTracking"] ||
  mongoose.model("PdfTracking", PdfTrackingSchema, "pdf_tracking");

export default PdfTracking;
