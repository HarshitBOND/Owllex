import mongoose from "mongoose";

const DownloadedPDFSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  download_url: { type: String, default: "" },
  downloaded_at: { type: Date, default: Date.now },
  download_date_str: { type: String, default: "" },
  file_size_bytes: { type: Number, default: 0 },
  file_hash: { type: String, unique: true },
  parse_status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  cases_extracted: { type: Number, default: 0 },
  processed: { type: Boolean, default: false },
  deleted_at: { type: Date, default: null },
  execution_time_seconds: { type: Number, default: 0 },
  error_message: { type: String, default: null },
  import_id: { type: String, default: null },
});

DownloadedPDFSchema.index({ downloaded_at: -1 });
DownloadedPDFSchema.index({ parse_status: 1, downloaded_at: -1 });
DownloadedPDFSchema.index({ import_id: 1, downloaded_at: -1 });

const DownloadedPDF =
  mongoose.models["DownloadedPDF"] ||
  mongoose.model("DownloadedPDF", DownloadedPDFSchema, "downloaded_pdfs");

export default DownloadedPDF;
