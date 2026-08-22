import { FileText, MessageCircle, Calendar, Users, Truck, PenTool, Scale, Clock } from "lucide-react"
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal"

const services = [
  {
    icon: FileText,
    title: "Document Generation",
    description: "Create affidavits, agreements, and legal documents instantly with AI-powered templates.",
  },
  {
    icon: MessageCircle,
    title: "Legal Consultation",
    description: "Chat or call verified lawyers instantly for expert legal advice and guidance.",
  },
  {
    icon: Scale,
    title: "Case Tracking",
    description: "Monitor your court cases across India with real-time updates and alerts.",
  },
  {
    icon: Calendar,
    title: "Court Calendar",
    description: "Never miss important dates with automated hearing reminders and court schedules.",
  },
  {
    icon: Users,
    title: "Lawyer Network",
    description: "Access our verified network of legal professionals across all practice areas.",
  },
  {
    icon: Truck,
    title: "Doorstep Delivery",
    description: "Get your legal documents delivered to your door within hours of completion.",
  },
  {
    icon: PenTool,
    title: "Digital Notarization",
    description: "Complete notary services online or schedule home visits for document authentication.",
  },
  {
    icon: Clock,
    title: "Express Processing",
    description: "Fast-track your legal work with priority processing and same-day services.",
  },
]

export function ServicesGrid() {
  return (
    <section id="services" className="py-20 bg-background px-6">
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Services</p>
          <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Comprehensive legal solutions
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need for your legal requirements, powered by technology and delivered with excellence.
          </p>
        </Reveal>

        <RevealGroup className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-border">
          {[services.slice(0, 4), services.slice(4)].map((column, colIndex) => (
            <div key={colIndex} className="divide-y divide-border sm:odd:pr-10 sm:even:pl-10">
              {column.map((service) => {
                const Icon = service.icon
                return (
                  <RevealItem key={service.title} className="group flex gap-4 py-6 first:pt-0">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover:bg-primary/15">
                      <Icon className="h-4 w-4 text-primary transition-transform duration-300 group-hover:scale-110" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{service.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{service.description}</p>
                    </div>
                  </RevealItem>
                )
              })}
            </div>
          ))}
        </RevealGroup>
      </div>
    </section>
  )
}
