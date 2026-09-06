import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, ShieldCheck, Scale, Sparkles } from "lucide-react"
import { Reveal } from "@/components/motion/reveal"
import { imageBlurDataURL } from "@/lib/image-placeholders"

export function WaitlistSection() {
  return (
    <section className="py-20 px-6 text-primary-foreground relative overflow-hidden">
      {/* Background Image */}
      <Image
        src="/images/waitlist-pont-alexandre.jpg"
        alt="Pont Alexandre III at golden hour, Paris"
        fill
        placeholder="blur"
        blurDataURL={imageBlurDataURL["/images/waitlist-pont-alexandre.jpg"]}
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-primary/85" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40" />

      <div className="container relative">
        <Reveal className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/20 mb-6">
            <Sparkles className="h-8 w-8 text-secondary" />
          </div>

          <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Ready to modernize your practice?
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            Create your free account and start drafting, reviewing, researching, and tracking cases with ravenslaw
            today. No waitlist, no waiting.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 mb-12 text-sm font-medium text-primary-foreground/80">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-secondary" />
              7-day free trial, no credit card required
            </div>
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-secondary" />
              Grounded in your own case files
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              Upgrade anytime as your practice grows
            </div>
          </div>

          <Link href="/sign-up">
            <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground h-12 px-8">
              Start for Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
