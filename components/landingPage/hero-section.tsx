"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Scale, FileText, Users, Truck } from "lucide-react"
import { SignedIn, SignedOut } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

export function HeroSection() {
    const router = useRouter()
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
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <SignedOut>
                <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" size="lg">
                  Watch Demo
                </Button>
              </SignedOut>
              <SignedIn>
                <Button variant="outline" size="lg" onClick={() => router.push("/dashboard")}>
                  Continue to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </SignedIn>
            </div>
          </div>

          {/* Floating Icons */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/4 top-1/4 animate-float">
              <div className="rounded-full bg-primary/10 p-3">
                <Scale className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="absolute right-1/4 top-1/3 animate-float" style={{ animationDelay: "1s" }}>
              <div className="rounded-full bg-secondary/10 p-3">
                <FileText className="h-6 w-6 text-secondary" />
              </div>
            </div>
            <div className="absolute left-1/3 bottom-1/4 animate-float" style={{ animationDelay: "2s" }}>
              <div className="rounded-full bg-primary/10 p-3">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="absolute right-1/3 bottom-1/3 animate-float" style={{ animationDelay: "0.5s" }}>
              <div className="rounded-full bg-secondary/10 p-3">
                <Truck className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </div>
        </div>
      </section>
    )
}
