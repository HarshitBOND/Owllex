"use client"

import React, { useState } from 'react'
import Sidebar from "@/components/dashboard/sidebar"
import Navbar from "@/components/dashboard/navbar"
import { useSidebar } from "@/contexts/SidebarContext"
import { cn } from "@/lib/utils"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, CheckCircle, AlertCircle, Mail, Phone, MapPin, MessageSquare } from "lucide-react"

const ContactUs = () => {
  const { isOpen } = useSidebar()
  const { isLoaded, isSignedIn, user } = useUser()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F3F5F9]">
        <div className="w-12 h-12 border-4 border-t-transparent border-sidebar-primary rounded-full animate-spin" />
      </div>
    )
  }
  if (!isSignedIn) {
    return redirect("/")
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('loading')

    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setStatus('success')
        setFormData({ name: '', email: '', subject: '', message: '' })
        setTimeout(() => setStatus('idle'), 5000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 5000)
      }
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={cn("bg-[#F3F5F9] min-h-screen w-full transition-all duration-300", isOpen ? "lg:ml-48" : "lg:ml-12")}>
        <div className="bg-white border-b border-gray-200 w-full">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-4">
            <Navbar location="Help & Support" />
          </div>
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Contact Info Cards */}
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
                      <p className="text-sm text-gray-500">support@lexvert.com</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-50 rounded-lg">
                      <Phone className="h-5 w-5 text-green-600" />
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

              {/* FAQ Quick Links */}
              <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Common Topics</h3>
                <div className="space-y-2">
                  {["Subscription & Billing", "Case Management", "Technical Issues", "Feature Requests", "Account Settings"].map((topic) => (
                    <button key={topic} onClick={() => setFormData({ ...formData, subject: topic })} className="w-full text-left text-sm text-gray-600 hover:text-sidebar-primary hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors">
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm p-6 md:p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Send us a message</h2>
                <p className="text-sm text-gray-500 mb-6">Fill out the form below and we&apos;ll get back to you as soon as possible.</p>

                {/* Status Messages */}
                {status === 'success' && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Message sent successfully!</p>
                      <p className="text-xs text-green-600">We&apos;ll get back to you within 24 hours.</p>
                    </div>
                  </div>
                )}
                {status === 'error' && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Failed to send message</p>
                      <p className="text-xs text-red-600">Please try again or email us directly.</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
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
                        onChange={handleChange}
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
                        onChange={handleChange}
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
                      onChange={handleChange}
                      required
                      className="w-full h-11 rounded-md border-2 border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sidebar-primary/30 focus:border-sidebar-primary"
                    >
                      <option value="">Select a topic</option>
                      <option value="billing">Subscription & Billing</option>
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
                      onChange={handleChange}
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
                      disabled={status === 'loading'}
                      className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white px-6"
                      size="lg"
                    >
                      {status === 'loading' ? (
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContactUs