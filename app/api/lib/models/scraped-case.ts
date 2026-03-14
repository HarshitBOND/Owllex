import mongoose from "mongoose";

const ScrapedCaseSchema = new mongoose.Schema({
  list_type: { type: String, default: null },
  list_date: { type: String, default: null },
  court_no: { type: String, default: null },
  bench: { type: String, default: null },
  judge: { type: String, default: null },
  section: { type: String, default: null },
  item_no: { type: String, default: null },
  main_case_no: { type: String, required: true },
  linked_cases: { type: [String], default: [] },
  petitioner: { type: String, default: "" },
  respondent: { type: String, default: "" },
  advocate_petitioner: { type: String, default: "" },
  advocate_respondent: { type: String, default: "" },
  raw_parties: { type: String, default: "" },
  source_pdf: { type: String, default: null },
  pdf_date: { type: Date, default: null },
  parsed_at: { type: Date, default: Date.now },
  status: { type: String, default: "extracted" },
});

ScrapedCaseSchema.index(
  { main_case_no: 1, list_date: 1, court_no: 1 },
  { unique: true }
);
ScrapedCaseSchema.index({ parsed_at: -1 });

const ScrapedCase =
  mongoose.models["ScrapedCase"] ||
  mongoose.model("ScrapedCase", ScrapedCaseSchema, "scraped_cases");

export default ScrapedCase;
