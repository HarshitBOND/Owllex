import type React from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { Outfit, Amethysta, Averia_Serif_Libre, Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { SidebarProvider } from "@/contexts/SidebarContext"
import { AiChatProvider } from "@/contexts/AiChatContext"
import { ThemeProvider } from "@/components/theme-provider"

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

const averiaSerifLibre = Averia_Serif_Libre({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-averia-serif-libre",
  weight: ["400", "700"],
})

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
})

const clerkLocalization = {
  formFieldLabel__emailAddress: "Email",
  formFieldInputPlaceholder__emailAddress: "m@example.com",
  formFieldLabel__password: "Password",
  formFieldAction__forgotPassword: "Forgot your password?",
  socialButtonsBlockButton: "Continue with Google",
}

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.ico?v=2",
  },
  title: "Ravenslaw - Your Complete Legal Ecosystem",
  description:
    "Draft documents, track cases, find lawyers, and get doorstep delivery all powered by cutting-edge technology.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const requestHeaders = await headers()
  const nonce = requestHeaders.get("x-nonce") || undefined

  return (
    <html lang="en" className={`${outfit.variable} ${amethysta.variable} ${averiaSerifLibre.variable} ${inter.variable} antialiased`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem nonce={nonce}>
          <ClerkProvider
            dynamic
            nonce={nonce}
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            localization={clerkLocalization}
          >
            <SidebarProvider>
              <AiChatProvider>
                {children}
              </AiChatProvider>
            </SidebarProvider>
            <Toaster position="bottom-right" richColors closeButton />
            <Analytics />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
