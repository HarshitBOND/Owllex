import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Zap, Smartphone, Shield, BarChart3, Bell } from "lucide-react"

const features = [
  {
    icon: Zap,
    title: "Lightning Fast Delivery",
    description:
      "Legal documents delivered to your door within hours, not days. Our streamlined process ensures rapid turnaround times.",
    stats: "2-4 hours average delivery",
  },
  {
    icon: Smartphone,
    title: "Complete Digital Experience",
    description:
      "Handle all your legal needs from your smartphone. No office visits, no paperwork hassles - everything online.",
    stats: "100% digital workflow",
  },
  {
    icon: Shield,
    title: "Verified Legal Experts",
    description: "All lawyers, notaries, and service providers are thoroughly vetted and verified by our expert team.",
    stats: "500+ verified professionals",
  },
  {
    icon: BarChart3,
    title: "Nationwide Case Tracking",
    description:
      "Track any court case across India with real-time updates, hearing alerts, and comprehensive case management.",
    stats: "All Indian courts covered",
  },
  {
    icon: Bell,
    title: "Smart Legal Alerts",
    description:
      "Stay informed about hearing dates, judge schedules, courtroom changes, and important legal deadlines.",
    stats: "Real-time notifications",
  },
]

export function WhyChooseSection() {
  return (
    <section id="features" className="py-20 bg-muted/30 px-6">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why Legal Professionals Choose lexvert
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built by legal experts and tech innovators to solve real problems in the legal industry.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 bg-background border-0">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-4">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-semibold">{feature.title}</CardTitle>
                      <div className="text-sm text-secondary font-medium">{feature.stats}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
