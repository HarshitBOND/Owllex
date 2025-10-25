import mongoose from "mongoose";

const FilingSchema = new mongoose.Schema(
  {
    srlNo: { type: String },
    date: { type: String },
    filingDetails: { type: String },
  }
)

const ListingSchema = new mongoose.Schema(
  {
    srlNo: { type: String },
    date: { type: String },
    listingDetails: { type: String },
  }
)

const CaseSchema = new mongoose.Schema(
  {
    fileNo: { type: String },
    caseNo: { type: String, required: true },
    cnrNo: { type: String },
    caseTitle: {type: String, required: true},
    advocate: {type: String, required: true},
    caseStage: {type: String},
    remarks: { type: String, default: ""},
    links: {type: [String], default: []},
    documents: {type: [String], default: []},
    courtName: {type: String},
    courtValue: {type: String},
    courtRoom: {type: String},
    courtDate: {type: String},
    fillingAdvocate: {type: String},
    fillingDate: {type: String},
    status: {type: String},
    registrationDate: {type: String}, 
    filingDetails: {type: [FilingSchema], default: []},
    listingDetails: {type: [ListingSchema], default: []},
    notes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Note", default: [] }],
    client: {type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null},
  }
);

const Case = mongoose.models["Case"] || mongoose.model("Case", CaseSchema);

export default Case;
