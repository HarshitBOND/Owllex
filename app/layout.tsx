import type React from "react"
import type { Metadata } from "next"
import { DM_Sans, Space_Grotesk, Outfit, Amethysta } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { SidebarProvider } from "@/contexts/SidebarContext"
import { ThemeProvider } from "@/components/theme-provider"

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
})

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
  weight: ["400", "500", "600", "700"],
})

const amethysta = Amethysta({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-amethysta",
  weight: ["400"],
})

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.ico",
  },
  title: "Levert - Your Complete Legal Ecosystem",
  description:
    "Draft documents, track cases, find lawyers, and get doorstep delivery — all powered by cutting-edge technology.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable} ${outfit.variable} ${amethysta.variable} antialiased`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ClerkProvider>
            <SidebarProvider>
              {children}
            </SidebarProvider>
            <Analytics />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
