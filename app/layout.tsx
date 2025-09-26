import type React from "react"
import type { Metadata } from "next"
import { DM_Sans, Space_Grotesk } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { SidebarProvider } from "@/contexts/SidebarContext"

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
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
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable} antialiased`}>
      <body>
        <ClerkProvider>
          <SidebarProvider>
            {children}
          </SidebarProvider>
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  )
}
