import { Mail, MapPin, MessageSquare, Phone } from "lucide-react"
import { commonTopics } from "../utils"

export function ContactInfoPanel({ onTopicSelect }: { onTopicSelect: (topic: string) => void }) {
  return (
    <div className="lg:col-span-1 space-y-4">
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Get in Touch</h2>
        <p className="text-sm text-gray-500 mb-6">We&apos;d love to hear from you. Reach out anytime.</p>

        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-900">Email</p>
              <p className="text-sm text-gray-500">support@ravenslaw.com</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-brand-50 rounded-lg">
              <Phone className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-900">Phone</p>
              <p className="text-sm text-gray-500">+91 98765 43210</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-violet-50 rounded-lg">
              <MapPin className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-900">Office</p>
              <p className="text-sm text-gray-500">Delhi High Court Complex, New Delhi, India</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-900">Response Time</p>
              <p className="text-sm text-gray-500">We typically respond within 24 hours</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Common Topics</h3>
        <div className="space-y-2">
          {commonTopics.map((topic) => (
            <button
              key={topic}
              onClick={() => onTopicSelect(topic)}
              className="w-full text-left text-sm text-gray-600 hover:text-sidebar-primary hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
