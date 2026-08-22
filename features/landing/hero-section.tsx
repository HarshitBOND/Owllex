import Image from "next/image"
import { Scale } from "lucide-react"
import { HeroButtons } from "./hero-buttons"
import { Reveal } from "@/components/motion/reveal"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background px-6 py-12 lg:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="container relative">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm font-medium text-muted-foreground">
                <Scale className="h-4 w-4 text-primary" />
                India&apos;s comprehensive legal ecosystem
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <h1 className="mt-6 font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Justice, built on a
                <span className="block text-primary">solid foundation.</span>
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground lg:max-w-xl">
                From document generation to lawyer consultations and nationwide case tracking, lexvert brings the full
                weight of legal expertise to your doorstep &mdash; backed by technology, delivered with the gravity it
                deserves.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <HeroButtons />
            </Reveal>
          </div>

          <Reveal delay={0.15} y={32} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl shadow-2xl">
              <Image
                src="/images/hero-paris-louvre.jpg"
                alt="Ornate neoclassical facade of the Louvre, Paris"
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>

            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border bg-card p-4 shadow-lg sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Scale className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Verified legal experts</p>
                  <p className="text-xs text-muted-foreground">Vetted across every practice area</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
