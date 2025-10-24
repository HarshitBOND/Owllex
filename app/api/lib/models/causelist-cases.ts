import mongoose from "mongoose";

const CauseListCaseSchema = new mongoose.Schema(
  {
    item_no: { type: String },
    case_no: { type: String },
    case_title: {type: String},
    advocate: {type: String},
    case_stage: {type: String},
    remarks: { type: String, default: ""},
    links: {type: [String], default: []},
    court_name: {type: String},
    court_value: {type: String},
    cause_list_date: {type: String},
    scrapped_at: {type: Date, default: null},
    uid: {type: String},
  }
);

const CauseListCase = mongoose.models["CauseList-Case"] || mongoose.model("CauseList-Case", CauseListCaseSchema);

export default CauseListCase;
