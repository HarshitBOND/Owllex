"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { ArrowRight, Mail, Users, Sparkles } from "lucide-react"

export function WaitlistSection() {
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle waitlist signup
    setIsSubmitted(true)
    setEmail("")
  }

  return (
    <section className="py-20 bg-primary text-primary-foreground relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23ffffff' fillOpacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container relative">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/20 mb-6">
            <Sparkles className="h-8 w-8 text-secondary" />
          </div>

          <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Be Among the First to Experience lexvert
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join our exclusive waitlist and get early access to India's most comprehensive legal ecosystem. Plus, enjoy
            special launch pricing and premium features.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
              <CardContent className="pt-6 text-center">
                <Users className="h-8 w-8 text-secondary mx-auto mb-3" />
                <CardTitle className="text-lg mb-2">Early Access</CardTitle>
                <p className="text-sm text-primary-foreground/70">
                  Be the first to use our platform before public launch
                </p>
              </CardContent>
            </Card>

            <Card className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
              <CardContent className="pt-6 text-center">
                <Mail className="h-8 w-8 text-secondary mx-auto mb-3" />
                <CardTitle className="text-lg mb-2">Special Pricing</CardTitle>
                <p className="text-sm text-primary-foreground/70">Exclusive launch discounts and lifetime benefits</p>
              </CardContent>
            </Card>

            <Card className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
              <CardContent className="pt-6 text-center">
                <Sparkles className="h-8 w-8 text-secondary mx-auto mb-3" />
                <CardTitle className="text-lg mb-2">Premium Features</CardTitle>
                <p className="text-sm text-primary-foreground/70">Access to advanced AI tools and priority support</p>
              </CardContent>
            </Card>
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
                  We'll notify you as soon as lexvert launches. Get ready for the future of legal services!
                </p>
              </div>
            </div>
          )}

          <p className="text-sm text-primary-foreground/60 mt-6">
            Join <span className="font-semibold text-secondary">2,500+</span> legal professionals already on our
            waitlist
          </p>
        </div>
      </div>
    </section>
  )
}
