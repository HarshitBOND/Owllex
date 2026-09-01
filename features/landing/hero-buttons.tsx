"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { SignedIn, SignedOut } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import Link from "next/link"

export function HeroButtons() {
    const router = useRouter()
    return (
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-x-6">
            <SignedOut>
                <Link href="/sign-up" className="w-full sm:w-auto">
                    <Button size="lg" className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground sm:w-auto">
                        Get Started Free
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
                <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                >
                    See How It Works
                </Button>
            </SignedOut>
            <SignedIn>
                <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => router.push("/dashboard")}>
                    Continue to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </SignedIn>
        </div>
    )
}
