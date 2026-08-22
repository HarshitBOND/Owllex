import { FileText, Shield, Briefcase, BookOpen, Scale, Sparkles } from "lucide-react"
import type { AffidavitTemplate } from "./types"

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const affidavitTemplates: AffidavitTemplate[] = [
  {
    id: "general",
    name: "General Affidavit",
    description: "A standard sworn statement for general legal purposes",
    icon: FileText,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    fields: ["Full Name", "Address", "Statement"],
  },
  {
    id: "self-declaration",
    name: "Self Declaration",
    description: "For identity verification, name change, or self-attestation",
    icon: Shield,
    color: "text-green-600",
    bgColor: "bg-green-50",
    fields: ["Full Name", "Father's Name", "Address", "Purpose"],
  },
  {
    id: "income",
    name: "Income Affidavit",
    description: "Declaration of annual income from all sources",
    icon: Briefcase,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    fields: ["Full Name", "Occupation", "Annual Income", "Sources"],
  },
  {
    id: "property",
    name: "Property Affidavit",
    description: "For property ownership, transfer, or dispute matters",
    icon: BookOpen,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    fields: ["Full Name", "Property Address", "Ownership Details"],
  },
  {
    id: "court",
    name: "Court Affidavit",
    description: "For filing in court proceedings and legal cases",
    icon: Scale,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    fields: ["Case Number", "Court Name", "Petitioner", "Respondent", "Statement"],
  },
  {
    id: "custom",
    name: "Custom Affidavit",
    description: "AI-powered: Describe your need and we generate it",
    icon: Sparkles,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    fields: ["Description"],
  },
]
