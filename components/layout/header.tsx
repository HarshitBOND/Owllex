"use client"

import { Button } from "@/components/ui/button"
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { LayoutDashboard, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    if (!mounted) return
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-serif text-xl font-bold text-primary">
            <img src="/logo.png" width={140} alt="" />
          </span>
        </div>

        <nav className="hidden md:flex items-center space-x-6">
          <a href="#services" className="text-sm font-medium hover:text-primary transition-colors">
            Services
          </a>
          <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
            How It Works
          </a>
          <a href="#contact" className="text-sm font-medium hover:text-primary transition-colors">
            Contact
          </a>
        </nav>

        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="h-9 w-9"
          >
            {mounted && theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </Button>

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
        </div>
      </div>
    </header>
  )
}
