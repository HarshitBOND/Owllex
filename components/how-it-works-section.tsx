import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, Search, FileEdit, Sparkles } from "lucide-react"

const steps = [
  {
    step: "01",
    icon: Search,
    title: "Choose Your Service",
    description:
      "Select from our comprehensive range of legal services - from document generation to lawyer consultations and case tracking.",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    step: "02",
    icon: FileEdit,
    title: "Provide Information",
    description:
      "Fill in your details using our intelligent forms that simplify complex legal jargon into easy-to-understand questions.",
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    step: "03",
    icon: Sparkles,
    title: "AI-Powered Generation",
    description:
      "Our advanced AI instantly creates legally valid documents using verified templates and expert-reviewed processes.",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 bg-background">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">How LexsGO Works</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Our integrated platform handles everything from document creation to delivery. One account, unlimited legal
            solutions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={index} className="relative">
                <Card className="group hover:shadow-lg transition-all duration-300 bg-card border-0 h-full">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${step.bgColor}`}>
                        <Icon className={`h-6 w-6 ${step.color}`} />
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground/30 font-serif">{step.step}</div>
                    </div>
                    <CardTitle className="text-xl font-semibold">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>

                {/* Arrow connector */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ArrowRight className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="text-center">
          <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
            Start Your Legal Journey
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}
