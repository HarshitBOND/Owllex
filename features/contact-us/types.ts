export type ContactStatus = "idle" | "loading" | "success" | "error"

export interface ContactFormData {
  name: string
  email: string
  subject: string
  message: string
}
