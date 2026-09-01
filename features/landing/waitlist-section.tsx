"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Mail, Users, Sparkles } from "lucide-react"
import { Reveal } from "@/components/motion/reveal"
import { imageBlurDataURL } from "@/lib/image-placeholders"

export function WaitlistSection() {
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Waitlist Signup', email, subject: 'Waitlist', message: `Waitlist signup: ${email}` })
      })
    } catch { /* silent */ }
    setIsSubmitted(true)
    setEmail("")
  }

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
            Be Among the First to Experience ravenslaw
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            Join our exclusive waitlist and get early access to India's most comprehensive legal ecosystem. Plus, enjoy
            special launch pricing and premium features.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 mb-12 text-sm font-medium text-primary-foreground/80">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-secondary" />
              Early access before public launch
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-secondary" />
              Exclusive launch pricing
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              Priority support at launch
            </div>
          </div>

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 bg-primary-foreground text-foreground border-0 h-12"
              />
              <Button
                type="submit"
                size="lg"
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground h-12 px-8"
              >
                Join Waitlist
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="bg-secondary/20 rounded-lg p-6 text-center">
                <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                  <ArrowRight className="h-6 w-6 text-secondary-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">You're on the list!</h3>
                <p className="text-primary-foreground/80 text-sm">
                  We'll notify you as soon as ravenslaw launches. Get ready for the future of legal services!
                </p>
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}
