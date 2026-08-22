import type { FraudReportFormData } from "./types"

export const emptyFraudReportForm: FraudReportFormData = {
  name: "",
  email: "",
  phone: "",
  incidentTitle: "",
  incidentDetails: "",
  incidentDate: "",
  caseReference: "",
  amountInvolved: "",
  priority: "medium",
}
