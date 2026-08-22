import { Input } from "@/components/ui/input"
import type { FraudReportFormData } from "../types"

interface FraudReportFieldsProps {
  formData: FraudReportFormData
  placeholderName: string
  placeholderEmail: string
  onChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void
}

export function FraudReportFields({
  formData,
  placeholderName,
  placeholderEmail,
  onChange,
}: FraudReportFieldsProps) {
  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={onChange}
            placeholder={placeholderName}
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={onChange}
            placeholder={placeholderEmail}
            required
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
          <Input
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={onChange}
            placeholder="+91..."
          />
        </div>

        <div>
          <label htmlFor="incidentDate" className="block text-sm font-medium text-gray-700 mb-1.5">Incident Date (optional)</label>
          <Input
            id="incidentDate"
            name="incidentDate"
            type="date"
            value={formData.incidentDate}
            onChange={onChange}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="incidentTitle" className="block text-sm font-medium text-gray-700 mb-1.5">Incident Title</label>
          <Input
            id="incidentTitle"
            name="incidentTitle"
            value={formData.incidentTitle}
            onChange={onChange}
            placeholder="Unauthorized payment attempt"
            required
          />
        </div>

        <div>
          <label htmlFor="caseReference" className="block text-sm font-medium text-gray-700 mb-1.5">Case Reference (optional)</label>
          <Input
            id="caseReference"
            name="caseReference"
            value={formData.caseReference}
            onChange={onChange}
            placeholder="CASE-2026-001"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
          <select
            id="priority"
            name="priority"
            value={formData.priority}
            onChange={onChange}
            className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label htmlFor="amountInvolved" className="block text-sm font-medium text-gray-700 mb-1.5">Amount Involved (optional)</label>
          <Input
            id="amountInvolved"
            name="amountInvolved"
            type="number"
            min={0}
            step="0.01"
            value={formData.amountInvolved}
            onChange={onChange}
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label htmlFor="incidentDetails" className="block text-sm font-medium text-gray-700 mb-1.5">Incident Details</label>
        <textarea
          id="incidentDetails"
          name="incidentDetails"
          value={formData.incidentDetails}
          onChange={onChange}
          rows={6}
          required
          placeholder="Describe what happened, when it happened, and any relevant context..."
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30"
        />
      </div>
    </>
  )
}
