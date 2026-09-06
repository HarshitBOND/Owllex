import Link from "next/link"
import { ArrowRight, BadgeCheck, Clock, ShieldCheck } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"

const TRIAL_FEATURES = [
  "Up to 3 active cases",
  "Fast AI model for drafting, research, and chat",
  "₹100 of AI usage included",
  "Index up to 5 documents",
  "Cause-list lookup",
]

export default function TrialPage() {
  return (
    <main className="min-h-screen">
      <Header />

      <section className="relative overflow-hidden bg-background px-6 py-16 lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="container relative mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4 text-primary" />
            No credit card required
          </div>

          <h1 className="mt-6 font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Try Ravenslaw free for
            <span className="block text-primary">7 days.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Every new account gets full access to Ravenslaw for a week — draft documents, review contracts, run
            research, and track cases on your own matters. No permanently free tier, just a real trial period to see
            if it fits your practice.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/sign-up" className="w-full sm:w-auto">
              <Button size="lg" className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground sm:w-auto">
                Start your 7-day trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                See plans &amp; pricing
              </Button>
            </Link>
          </div>
        </div>

        <div className="container relative mx-auto mt-16 grid max-w-4xl gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              What&apos;s included
            </h2>
            <ul className="mt-4 space-y-2">
              {TRIAL_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock className="h-5 w-5 text-primary" />
              After 7 days
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Your trial ends automatically 7 days after you sign up. Your cases and data stay exactly as you left
              them — pick a paid plan from{" "}
              <Link href="/pricing" className="font-medium text-primary underline underline-offset-2">
                Pricing
              </Link>{" "}
              whenever you&apos;re ready to keep going.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
