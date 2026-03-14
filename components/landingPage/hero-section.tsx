import { Scale, FileText, Users, Truck } from "lucide-react"
import { HeroButtons } from "./hero-buttons"

export function HeroSection() {
    return (
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/30 py-20 lg:py-32">
        <div className="container relative">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Your Complete <span className="text-primary">Legal Ecosystem</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Draft documents, track cases, find lawyers, and get doorstep delivery — all powered by cutting-edge
              technology. Everything legal in one platform.
            </p>
            <HeroButtons />
          </div>

          {/* Floating Icons - Static, loaded after interaction */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/4 top-1/4">
              <div className="rounded-full bg-primary/10 p-3">
                <Scale className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="absolute right-1/4 top-1/3">
              <div className="rounded-full bg-secondary/10 p-3">
                <FileText className="h-6 w-6 text-secondary" />
              </div>
            </div>
            <div className="absolute left-1/3 bottom-1/4">
              <div className="rounded-full bg-primary/10 p-3">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="absolute right-1/3 bottom-1/3">
              <div className="rounded-full bg-secondary/10 p-3">
                <Truck className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </div>
        </div>
      </section>
    )
}
