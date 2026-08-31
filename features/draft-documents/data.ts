import { FileText, UserRound, ShieldCheck, MoreHorizontal } from "lucide-react"

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  time: string
  clauseHtml?: string
}

export type DocumentTemplate = {
  name: string
  description: string
  icon: typeof FileText
  color: string
  bgColor: string
}

export const documentTemplates: DocumentTemplate[] = [
  {
    name: "Rental Agreement",
    description: "Lease, subleases, tenancy",
    icon: FileText,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    name: "Service Agreement",
    description: "Consultancy, freelance, service",
    icon: UserRound,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    name: "Non-Disclosure Agreement",
    description: "Confidentiality, NDAs",
    icon: ShieldCheck,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-500/10",
  },
  {
    name: "More documents",
    description: "Explore 50+ legal templates",
    icon: MoreHorizontal,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
  },
]

export type RecentDocument = {
  name: string
  status: "Draft" | "Final"
  lastModified: string
  type: string
  icon: typeof FileText
  color: string
  bgColor: string
}

export const recentDocuments: RecentDocument[] = [
  {
    name: "Rental Agreement – 123 Main St",
    status: "Draft",
    lastModified: "Today, 4:32 PM",
    type: "Rental Agreement",
    icon: FileText,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    name: "Service Agreement – Acme Consulting",
    status: "Draft",
    lastModified: "Yesterday, 2:15 PM",
    type: "Service Agreement",
    icon: UserRound,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    name: "Non-Disclosure Agreement – Zenith Labs",
    status: "Final",
    lastModified: "Aug 25, 2025",
    type: "NDA",
    icon: ShieldCheck,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-500/10",
  },
  {
    name: "Employment Agreement – Rahul Sharma",
    status: "Draft",
    lastModified: "Aug 22, 2025",
    type: "Employment Agreement",
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    name: "Rental Agreement – Sunrise Apartments",
    status: "Final",
    lastModified: "Aug 18, 2025",
    type: "Rental Agreement",
    icon: FileText,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    name: "Service Agreement – BrightTech Solutions",
    status: "Draft",
    lastModified: "Aug 15, 2025",
    type: "Service Agreement",
    icon: UserRound,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-500/10",
  },
]

export const baseDocumentHtml = `
<h1>RENTAL AGREEMENT</h1>
<p>This Rental Agreement (&ldquo;Agreement&rdquo;) is made and entered into on this ___ day of ______________, 20___, by and between:</p>
<h3>1. LANDLORD</h3>
<p>Name: ______________________________<br>Address: ______________________________</p>
<p>(hereinafter referred to as the &ldquo;Landlord&rdquo;)</p>
<p style="text-align: center"><strong>AND</strong></p>
<h3>2. TENANT</h3>
<p>Name: ______________________________<br>Address: ______________________________</p>
<p>(hereinafter referred to as the &ldquo;Tenant&rdquo;)</p>
<h3>3. PREMISES</h3>
<p>The Landlord hereby agrees to rent to the Tenant, and the Tenant hereby agrees to rent from the Landlord, the residential property located at:</p>
<p>______________________________________________</p>
<p>(hereinafter referred to as the &ldquo;Premises&rdquo;).</p>
<h3>4. TERM</h3>
<p>The term of this Agreement shall commence on ______________ and shall continue until ______________, unless terminated earlier in accordance with this Agreement.</p>
`.trim()

export const clauseVariants = {
  standard: `
<h3>5. SECURITY DEPOSIT</h3>
<p>The Tenant shall pay a security deposit of &#8377;_______________ (Rupees _______________________________ only) to the Landlord at the time of signing this Agreement.</p>
<p>The security deposit shall be refundable within _______ days of the termination of this Agreement, subject to the following conditions:</p>
<ul>
<li>The Tenant has vacated the Premises in good condition, normal wear and tear excepted.</li>
<li>All dues, including rent and utilities, have been paid in full.</li>
<li>No damage has been caused to the Premises or its furnishings.</li>
</ul>
<p>The Landlord may deduct any amount from the security deposit for damages, unpaid dues, or breach of this Agreement, and the balance, if any, shall be refunded to the Tenant.</p>
`.trim(),

  tenantFriendly: `
<h3>5. SECURITY DEPOSIT</h3>
<p>The Tenant shall pay a security deposit of &#8377;_______________ (Rupees _______________________________ only) to the Landlord at the time of signing this Agreement.</p>
<p>The Landlord shall refund the security deposit, less any lawful deductions, within <strong>15 days</strong> of the Tenant vacating the Premises, subject to the following conditions:</p>
<ul>
<li>The Tenant has vacated the Premises in good condition, normal wear and tear excepted.</li>
<li>All dues, including rent and utilities, have been paid in full.</li>
<li>No damage has been caused to the Premises or its furnishings beyond normal wear and tear.</li>
</ul>
<p>Any deduction shall be itemised in writing and provided to the Tenant along with the balance refund. The Tenant may raise a written objection to any deduction within 7 days of receiving the itemised statement.</p>
`.trim(),
}

export const interestClauseHtml =
  "<p>If the Landlord fails to refund the security deposit (or the undisputed balance thereof) within the period stated above, interest at <strong>12% per annum</strong> shall accrue on the outstanding amount from the due date until it is paid in full.</p>"

export function buildDocumentHtml(clause5Html: string) {
  return `${baseDocumentHtml}\n${clause5Html}`
}

export const quickActions = ["Make it more tenant-friendly", "Add interest on delay"]

export const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    text: "Please add a clause for security deposit and its refund conditions.",
    time: "6:45 PM",
  },
  {
    id: "m2",
    role: "assistant",
    text: "Sure, I've added the Security Deposit clause below. Let me know if you'd like any changes.",
    time: "6:45 PM",
    clauseHtml: clauseVariants.standard,
  },
]

export function generateAssistantReply(userText: string, currentClause5: string) {
  const t = userText.toLowerCase()

  if (t.includes("tenant")) {
    return {
      replyText:
        "Updated — I've added a grace period and made the deduction process more transparent for the Tenant.",
      clauseHtml: clauseVariants.tenantFriendly,
      newClause5: clauseVariants.tenantFriendly,
    }
  }

  if (t.includes("interest") || t.includes("delay")) {
    return {
      replyText:
        "Done — I've added an interest clause for delayed refunds beyond the stipulated period.",
      clauseHtml: interestClauseHtml,
      newClause5: currentClause5 + interestClauseHtml,
    }
  }

  if (t.includes("deposit")) {
    return {
      replyText: "Sure, I've added the Security Deposit clause below. Let me know if you'd like any changes.",
      clauseHtml: clauseVariants.standard,
      newClause5: clauseVariants.standard,
    }
  }

  return {
    replyText:
      "I can help with that. Try one of the quick actions below, or ask me to add a specific clause — for example, security deposit or interest on delay.",
    clauseHtml: undefined as string | undefined,
    newClause5: undefined as string | undefined,
  }
}
