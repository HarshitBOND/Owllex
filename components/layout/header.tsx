"use client"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ClerkLoaded, ClerkLoading, SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { LayoutDashboard, Menu, Moon, Sun, X } from "lucide-react"
import { useTheme } from "next-themes"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

const navLinks = [
  { href: "#services", label: "Services" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#contact", label: "Contact" },
]

function PlansNavLink({ className, onNavigate }: { className: string; onNavigate?: () => void }) {
  return (
    <>
      <SignedIn>
        <Link href="/pricing" onClick={onNavigate} className={className}>
          Plans &amp; Payments
        </Link>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal" forceRedirectUrl="/pricing">
          <button type="button" onClick={onNavigate} className={className}>
            Plans &amp; Payments
          </button>
        </SignInButton>
      </SignedOut>
    </>
  )
}

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    if (!mounted) return
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sm:px-6">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex shrink-0 items-center">
          <Image src="/ravenslaw.png" alt="ravenslaw" width={519} height={151} className="h-7 w-auto sm:h-8 md:h-9" priority />
        </Link>

        <nav className="hidden md:flex items-center space-x-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
          <ClerkLoaded>
            <PlansNavLink className="text-sm font-medium hover:text-primary transition-colors" />
          </ClerkLoaded>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-9 w-9 shrink-0"
          >
            {mounted && theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </Button>

          <div className="hidden items-center gap-3 md:flex">
            <ClerkLoading>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-28" />
            </ClerkLoading>
            <ClerkLoaded>
              <SignedIn>
                <UserButton showName={true}>
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="Dashboard"
                      labelIcon={<LayoutDashboard size={16} />}
                      href="/dashboard"
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </SignedIn>
              <SignedOut>
                <SignInButton>
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton>
                  <Button size="sm" className="bg-secondary hover:bg-secondary/90">
                    Get Started
                  </Button>
                </SignUpButton>
              </SignedOut>
            </ClerkLoaded>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 md:hidden"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium hover:bg-muted hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
            <ClerkLoaded>
              <PlansNavLink
                className="rounded-md px-2 py-2.5 text-left text-sm font-medium hover:bg-muted hover:text-primary transition-colors"
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </ClerkLoaded>
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t pt-3">
            <ClerkLoading>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </ClerkLoading>
            <ClerkLoaded>
              <SignedIn>
                <UserButton showName={true}>
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="Dashboard"
                      labelIcon={<LayoutDashboard size={16} />}
                      href="/dashboard"
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </SignedIn>
              <SignedOut>
                <SignInButton>
                  <Button variant="ghost" className="w-full justify-center">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton>
                  <Button className="w-full justify-center bg-secondary hover:bg-secondary/90">
                    Get Started
                  </Button>
                </SignUpButton>
              </SignedOut>
            </ClerkLoaded>
          </div>
        </div>
      )}
    </header>
  )
}
