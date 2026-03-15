"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { SignedIn, SignedOut } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import Link from "next/link"

export function HeroButtons() {
    const router = useRouter()
    return (
        <div className="mt-10 flex items-center justify-center gap-x-6">
            <SignedOut>
                <Link href="/sign-up">
                    <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                        Get Started Free
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
                <Button variant="outline" size="lg" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                    Watch Demo
                </Button>
            </SignedOut>
            <SignedIn>
                <Button variant="outline" size="lg" onClick={() => router.push("/dashboard")}>
                    Continue to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </SignedIn>
        </div>
    )
}
