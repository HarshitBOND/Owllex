import { Scale, Mail } from "lucide-react"
import Image from "next/image"
import { Reveal } from "@/components/motion/reveal"

const linkGroups = [
  {
    title: "Services",
    links: [
      { label: "Contract Review", href: "/contract-review" },
      { label: "Legal Research", href: "/legal-research" },
      { label: "Case Tracking", href: "/case-tracking" },
      { label: "Get Started", href: "/sign-up" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Contact", href: "mailto:support@ravenslaw.com" },
    ],
  },
  {
    title: "Legal",
    links: [{ label: "Terms of Use", href: "/terms-of-use" }],
  },
]

export function Footer() {
  return (
    <footer id="contact" className="relative overflow-hidden bg-[#0b1720] px-6 text-slate-300">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/2 h-[320px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <Reveal className="container relative py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Image src="/logo.png" width={140} height={140} alt="ravenslaw" className="brightness-0 invert opacity-90" />
            <p className="max-w-xs text-sm leading-relaxed text-slate-400">
              Your complete legal ecosystem. Revolutionizing how you handle legal work with cutting-edge technology.
            </p>
            <a
              href="mailto:support@ravenslaw.com"
              className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-primary"
            >
              <Mail className="h-4 w-4" />
              support@ravenslaw.com
            </a>
          </div>

          {linkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/70">{group.title}</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-slate-400 transition-colors hover:text-primary">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-sm text-slate-500">© 2026 ravenslaw. All rights reserved.</p>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Scale className="h-4 w-4" />
            Legal technology, built for India
          </div>
        </div>
      </Reveal>
    </footer>
  )
}
