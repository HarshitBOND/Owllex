import { useState } from "react"
import type { ContactStatus } from "../types"
import { emptyContactForm } from "../utils"

export function useContactForm() {
  const [formData, setFormData] = useState(emptyContactForm)
  const [status, setStatus] = useState<ContactStatus>("idle")

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const setSubject = (subject: string) => {
    setFormData((previous) => ({ ...previous, subject }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus("loading")

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setStatus("success")
        setFormData(emptyContactForm)
        setTimeout(() => setStatus("idle"), 5000)
      } else {
        setStatus("error")
        setTimeout(() => setStatus("idle"), 5000)
      }
    } catch {
      setStatus("error")
      setTimeout(() => setStatus("idle"), 5000)
    }
  }

  return { formData, status, handleChange, setSubject, handleSubmit }
}
