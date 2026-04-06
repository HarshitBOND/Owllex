"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, MessageCircle, Calendar, Users, Truck, PenTool, Scale, Clock } from "lucide-react"

const services = [
  {
    icon: FileText,
    title: "Document Generation",
    description: "Create affidavits, agreements, and legal documents instantly with AI-powered templates.",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    icon: MessageCircle,
    title: "Legal Consultation",
    description: "Chat or call verified lawyers instantly for expert legal advice and guidance.",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-500/10",
  },
  {
    icon: Scale,
    title: "Case Tracking",
    description: "Monitor your court cases across India with real-time updates and alerts.",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-500/10",
  },
  {
    icon: Calendar,
    title: "Court Calendar",
    description: "Never miss important dates with automated hearing reminders and court schedules.",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-500/10",
  },
  {
    icon: Users,
    title: "Lawyer Network",
    description: "Access our verified network of legal professionals across all practice areas.",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  {
    icon: Truck,
    title: "Doorstep Delivery",
    description: "Get your legal documents delivered to your door within hours of completion.",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-500/10",
  },
  {
    icon: PenTool,
    title: "Digital Notarization",
    description: "Complete notary services online or schedule home visits for document authentication.",
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-500/10",
  },
  {
    icon: Clock,
    title: "Express Processing",
    description: "Fast-track your legal work with priority processing and same-day services.",
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-500/10",
  },
]

export function ServicesGrid() {
  return (
    <section id="services" className="py-20 bg-background px-6">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Comprehensive Legal Solutions
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need for your legal requirements, powered by technology and delivered with excellence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon
            return (
              <Card key={index} className="group hover:shadow-lg h-full transition-all duration-300 border-0 bg-card">
                <CardHeader className="pb-4">
                  <div
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${service.bgColor} mb-4`}
                  >
                    <Icon className={`h-6 w-6 ${service.color}`} />
                  </div>
                  <CardTitle className="text-lg font-semibold">{service.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed mb-4">{service.description}</CardDescription>
                  <Button variant="link" size="sm" className="py-0 mt-auto text-primary" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                    Learn more →
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
