import { useState } from "react"
import type { FormStatus } from "../types"
import { emptyFraudReportForm } from "../utils"

export function useFraudReportForm() {
  const [formData, setFormData] = useState(emptyFraudReportForm)
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([])
  const [status, setStatus] = useState<FormStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const isBusy = status === "uploading" || status === "submitting"

  const handleInput = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  const handleEvidenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    setStatus("uploading")
    setErrorMessage("")

    try {
      const uploadedUrls: string[] = []

      for (const file of files) {
        const payload = new FormData()
        payload.append("file", file)

        const response = await fetch("/api/upload/file", {
          method: "POST",
          body: payload,
        })

        const data = await response.json()

        if (!response.ok || !data?.url) {
          throw new Error(data?.error || "Failed to upload evidence file")
        }

        uploadedUrls.push(data.url)
      }

      setEvidenceUrls((previous) => [...previous, ...uploadedUrls])
      setStatus("idle")
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(error?.message || "Failed to upload one or more files")
    } finally {
      event.target.value = ""
    }
  }

  const removeEvidence = (url: string) => {
    setEvidenceUrls((previous) => previous.filter((item) => item !== url))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus("submitting")
    setErrorMessage("")

    const amountParsed = formData.amountInvolved.trim()
      ? Number(formData.amountInvolved)
      : null

    const payload = {
      ...formData,
      amountInvolved:
        amountParsed !== null && Number.isFinite(amountParsed) && amountParsed >= 0
          ? amountParsed
          : null,
      evidenceUrls,
    }

    try {
      const response = await fetch("/api/fraud-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.message || data?.error || "Failed to submit fraud report")
      }

      setStatus("success")
      setFormData(emptyFraudReportForm)
      setEvidenceUrls([])
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(error?.message || "Could not submit fraud report")
    }
  }

  return {
    formData,
    evidenceUrls,
    status,
    errorMessage,
    isBusy,
    handleInput,
    handleEvidenceUpload,
    removeEvidence,
    handleSubmit,
  }
}
