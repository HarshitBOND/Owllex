import mongoose from "mongoose";

const FilingSchema = new mongoose.Schema(
  {
    srlNo: { type: String, required: true },
    date: { type: String, required: true },
    filingDetails: { type: String, required: true },
  }
)

const ListingSchema = new mongoose.Schema(
  {
    srlNo: { type: String, required: true },
    date: { type: String, required: true },
    listingDetails: { type: String, required: true },
  }
)

const CaseSchema = new mongoose.Schema(
  {
    fileNo: { type: String, required: true },
    caseNo: { type: String, required: true },
    caseTitle: {type: String, required: true},
    advocate: {type: String, required: true},
    caseStage: {type: String, required: true},
    remarks: { type: String, default: ""},
    links: {type: [String], default: []},
    documents: {type: [String], default: []},
    courtName: {type: String, required: true},
    courtValue: {type: String, required: true},
    courtRoom: {type: String, required: true},
    courtDate: {type: String, required: true},
    fillingAdvocate: {type: String, required: true},
    fillingDate: {type: String, required: true},
    status: {type: String, required: true},
    registrationDate: {type: String, required: true}, 
    filingDetails: {type: FilingSchema, required: true},
    listingDetails: {type: ListingSchema, required: true},
  }
);

const Case = mongoose.models.Case || mongoose.model("Case", CaseSchema);

export default Case;
