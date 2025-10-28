import mongoose from "mongoose";
import { FieldsSchema } from "./task";

const InvoiceSubParticularsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true },
  }
)

const InvoiceParticularsSchema = new mongoose.Schema(
  {
    case: { type: mongoose.Schema.Types.ObjectId, ref: "Case", required: true },
    name: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    subParticulars: { type: [InvoiceSubParticularsSchema], default: [] },
  }
)

const InvoiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: "Case" },
    resourceType: { type: String, required: true },
    resourceName: { type: String, required: true },
    currency: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    particulars: { type: [InvoiceParticularsSchema], required: true },
    paidAmount: { type: Number, required: true },
    raisedOn: { type: Date, required: true },
    dueOn: { type: Date, required: true },
    fieldToShow: { type: FieldsSchema, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }
)

const Invoice = mongoose.models["Invoice"] || mongoose.model("Invoice", InvoiceSchema);

export default Invoice;
