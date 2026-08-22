import { useRef, useState } from "react"
import type { FormValues } from "../types"
import { affidavitTemplates } from "../utils"

export function useAffidavitGenerator() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [formValues, setFormValues] = useState<FormValues>({})
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [copied, setCopied] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)

  const template = affidavitTemplates.find((t) => t.id === selectedTemplate)

  const selectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId)
    setStep(2)
  }

  const backToTemplates = () => {
    setStep(1)
    setSelectedTemplate(null)
  }

  const setFieldValue = (field: string, value: string) => {
    setFormValues((previous) => ({ ...previous, [field]: value }))
  }

  const handleGenerate = () => {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      setGenerated(true)
      setStep(3)
    }, 2500)
  }

  const editDetails = () => {
    setStep(2)
    setGenerated(false)
  }

  const createAnother = () => {
    setStep(1)
    setSelectedTemplate(null)
    setFormValues({})
    setGenerated(false)
  }

  const copyDocument = () => {
    if (!docRef.current) return
    navigator.clipboard.writeText(docRef.current.innerText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const previewDocument = () => {
    docRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  return {
    selectedTemplate,
    step,
    formValues,
    generating,
    generated,
    copied,
    docRef,
    template,
    selectTemplate,
    backToTemplates,
    setFieldValue,
    handleGenerate,
    editDetails,
    createAnother,
    copyDocument,
    previewDocument,
  }
}
