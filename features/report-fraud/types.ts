export type FormStatus = "idle" | "uploading" | "submitting" | "success" | "error"

export interface FraudReportFormData {
  name: string
  email: string
  phone: string
  incidentTitle: string
  incidentDetails: string
  incidentDate: string
  caseReference: string
  amountInvolved: string
  priority: string
}
