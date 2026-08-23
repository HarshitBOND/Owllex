import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { SignUp } from "@clerk/nextjs"

import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { imageBlurDataURL } from "@/lib/image-placeholders"

export const metadata: Metadata = {
  title: "Sign Up | Lexvert",
  description: "Create your Lexvert account.",
}

const clerkAppearance = {
  variables: {
    colorPrimary: "#0f172a",
    colorBackground: "transparent",
    colorText: "#ffffff",
    colorTextSecondary: "rgba(255,255,255,0.75)",
    colorInputBackground: "#ffffff",
    colorInputText: "#0f172a",
    colorDanger: "#fecaca",
    borderRadius: "0.6rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none bg-transparent",
    card: "w-full gap-5 bg-transparent p-0 shadow-none",
    header: "hidden",
    form: "flex flex-col gap-5",
    formFieldLabelRow: "flex items-center justify-between",
    formFieldLabel: "text-sm font-medium text-white",
    formFieldAction: "text-sm font-medium text-white/90 hover:text-white",
    formFieldInput:
      "h-11 rounded-lg border-0 bg-white text-slate-900 placeholder:text-slate-400 shadow-none focus:ring-2 focus:ring-white/70",
    formFieldInputShowPasswordButton: "text-slate-400 hover:text-slate-600",
    formButtonPrimary:
      "h-11 rounded-lg bg-slate-950 text-white text-sm font-semibold normal-case shadow-none hover:bg-slate-800 transition-colors",
    dividerRow: "hidden",
    socialButtonsRoot: "mt-1",
    socialButtonsBlockButton:
      "border-0 bg-transparent shadow-none h-10 rounded-lg text-white hover:bg-white/10 transition-colors",
    socialButtonsBlockButtonText: "text-sm font-medium text-white",
    footer: "hidden",
    identityPreviewText: "text-white",
    identityPreviewEditButton: "text-white",
    formFieldErrorText: "text-rose-100",
    alternativeMethodsBlockButton: "text-white/90 hover:bg-white/10",
    otpCodeFieldInput: "border-white/30 bg-white/10 text-white",
    formResendCodeLink: "text-white underline",
  },
  layout: {
    socialButtonsPlacement: "bottom" as const,
    socialButtonsVariant: "blockButton" as const,
  },
}

export default function SignUpPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <Image
        src="/images/auth-mountain-bg.jpg"
        alt=""
        fill
        priority
        placeholder="blur"
        blurDataURL={imageBlurDataURL["/images/auth-mountain-bg.jpg"]}
        sizes="100vw"
        className="object-cover"
      />

      <GlassCard className="relative z-10 w-full max-w-md border-white/25 bg-white/10 py-8 shadow-2xl backdrop-blur-2xl">
        <GlassCardContent>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl font-bold text-white">
                Create your account
              </h1>
              <p className="mt-2 text-sm text-white/75">
                Get started with your complete legal ecosystem
              </p>
            </div>
            <Link
              href="/sign-in"
              className="shrink-0 pt-1 text-sm font-semibold text-slate-900 hover:text-slate-700"
            >
              Sign In
            </Link>
          </div>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            appearance={clerkAppearance}
          />
        </GlassCardContent>
      </GlassCard>
    </main>
  )
}
