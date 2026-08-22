import { Header } from "@/components/layout/header"
import { HeroSection } from "@/features/landing/hero-section"
import { ServicesGrid } from "@/features/landing/services-grid"
import { WhyChooseSection } from "@/features/landing/why-choose-section"
import { HowItWorksSection } from "@/features/landing/how-it-works-section"
import { WaitlistSection } from "@/features/landing/waitlist-section"
import { Footer } from "@/components/layout/footer"

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Header />
      <HeroSection />
      <ServicesGrid />
      <WhyChooseSection />
      <HowItWorksSection />
      <WaitlistSection />
      <Footer />
    </main>
  )
}
