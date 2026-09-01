import Image from "next/image"
import { FolderKanban, Smartphone, BookOpenCheck, BarChart3 } from "lucide-react"
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal"
import { imageBlurDataURL } from "@/lib/image-placeholders"

const features = [
  {
    icon: FolderKanban,
    title: "A Workspace Per Matter",
    description: "Every case gets its own AI workspace — chat, drafting, and research all grounded in that matter's files.",
    stats: "One workspace, every matter",
  },
  {
    icon: Smartphone,
    title: "Complete Digital Practice",
    description: "Run drafting, review, research, cases, clients, and invoicing from a single dashboard.",
    stats: "100% digital workflow",
  },
  {
    icon: BookOpenCheck,
    title: "Cited & Verifiable",
    description: "Research answers and drafts are grounded in your own corpus, with sources you can check.",
    stats: "Grounded in your corpus",
  },
  {
    icon: BarChart3,
    title: "Nationwide Case Tracking",
    description: "Track any court case across India with real-time hearing alerts.",
    stats: "All Indian courts",
  },
]

export function WhyChooseSection() {
  return (
    <section id="features" className="py-20 bg-muted/30 px-6 overflow-hidden">
      <div className="container">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal y={0} className="relative order-2 mx-auto w-full max-w-md lg:order-1 lg:max-w-none" delay={0.05}>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl shadow-xl">
              <Image
                src="/images/why-choose-palais-garnier.jpg"
                alt="Ornate neoclassical facade detail, Paris"
                fill
                placeholder="blur"
                blurDataURL={imageBlurDataURL["/images/why-choose-palais-garnier.jpg"]}
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </div>
          </Reveal>

          <div className="order-1 lg:order-2">
            <Reveal className="mb-10 text-center lg:text-left">
              <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Why Legal Professionals Choose ravenslaw
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Built by legal experts and tech innovators to solve real problems in the legal industry.
              </p>
            </Reveal>

            <RevealGroup className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {features.map((feature) => {
                const Icon = feature.icon
                return (
                  <RevealItem key={feature.title} className="group">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-3 transition-colors duration-300 group-hover:bg-primary/15">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">{feature.title}</h3>
                    <div className="text-xs text-secondary font-medium mb-1.5">{feature.stats}</div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </RevealItem>
                )
              })}
            </RevealGroup>
          </div>
        </div>
      </div>
    </section>
  )
}
