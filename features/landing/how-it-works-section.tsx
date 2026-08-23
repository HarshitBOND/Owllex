import { Button } from "@/components/ui/button"
import { ArrowRight, Search, FileEdit, Sparkles } from "lucide-react"
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal"
import Link from "next/link"

const steps = [
  {
    step: "01",
    icon: Search,
    title: "Choose your service",
    description:
      "Select from our range of legal services — from document generation to lawyer consultations and case tracking.",
  },
  {
    step: "02",
    icon: FileEdit,
    title: "Provide information",
    description:
      "Fill in your details using intelligent forms that turn complex legal jargon into simple, guided questions.",
  },
  {
    step: "03",
    icon: Sparkles,
    title: "AI-powered generation",
    description:
      "Our advanced AI instantly creates legally valid documents using verified templates and expert-reviewed processes.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 bg-muted/30 px-6">
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">The process</p>
          <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How lexvert works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Our integrated platform handles everything from document creation to delivery. One account, unlimited
            legal solutions.
          </p>
        </Reveal>

        <RevealGroup className="relative mx-auto grid max-w-4xl grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          <div
            aria-hidden
            className="absolute left-0 right-0 top-6 hidden h-px bg-border md:block"
            style={{ marginInline: "16.66%" }}
          />

          {steps.map((step) => {
            const Icon = step.icon
            return (
              <RevealItem key={step.step} className="relative text-center md:text-left">
                <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background text-primary md:mx-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-5 text-xs font-semibold tracking-widest text-muted-foreground/60">
                  STEP {step.step}
                </div>
                <h3 className="mt-1.5 text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">{step.description}</p>
              </RevealItem>
            )
          })}
        </RevealGroup>

        <Reveal delay={0.2} className="text-center mt-16">
          <Link href="/sign-up">
            <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
              Start for Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
