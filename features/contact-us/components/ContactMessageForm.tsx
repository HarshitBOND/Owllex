import type { UserResource } from "@clerk/types"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ContactFormData, ContactStatus } from "../types"
import { ContactFormStatus } from "./ContactFormStatus"

interface ContactMessageFormProps {
  formData: ContactFormData
  status: ContactStatus
  user: UserResource | null | undefined
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}

export function ContactMessageForm({ formData, status, user, onChange, onSubmit }: ContactMessageFormProps) {
  return (
    <div className="lg:col-span-2">
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Send us a message</h2>
        <p className="text-sm text-gray-500 mb-6">Fill out the form below and we&apos;ll get back to you as soon as possible.</p>

        <ContactFormStatus status={status} />

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Name
              </label>
              <Input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={onChange}
                placeholder={user?.fullName || "Your name"}
                required
                className="h-11"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address
              </label>
              <Input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={onChange}
                placeholder={user?.primaryEmailAddress?.emailAddress || "your@email.com"}
                required
                className="h-11"
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1.5">
              Subject
            </label>
            <select
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={onChange}
              required
              className="w-full h-11 rounded-md border-2 border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary"
            >
              <option value="">Select a topic</option>
              <option value="general">General Support</option>
              <option value="technical">Technical Issue</option>
              <option value="feature">Feature Request</option>
              <option value="cases">Case Management</option>
              <option value="account">Account Settings</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={onChange}
              required
              rows={6}
              placeholder="Describe your issue or question in detail..."
              className="w-full rounded-md border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-400">All fields are required</p>
            <Button
              type="submit"
              disabled={status === "loading"}
              className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white px-6"
              size="lg"
            >
              {status === "loading" ? (
                <>
                  <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
