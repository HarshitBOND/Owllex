import mongoose from "mongoose";

const causeListSchema = new mongoose.Schema({
    item_no: { type: String, required: true },
    cause_no: { type: String, required: true },
    cause_title: { type: String, required: true },
    advocate: { type: String, required: true },
    case_stage: { type: String, required: true },
    remarks: { type: String, required: true },
    links: { type: String, required: true },
    court_name: { type: String, required: true },
    court_value: { type: String, required: true },
    cause_list_date: { type: String, required: true },
    scrapped_at: { type: Date, default: Date.now },

});

const CauseList = mongoose.models.CauseList || mongoose.model("case", causeListSchema);

export default CauseList;
