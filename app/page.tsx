import { Header } from "@/components/layout/header"
import { HeroSection } from "@/components/landingPage/hero-section"
import { ServicesGrid } from "@/components/landingPage/services-grid"
import { WhyChooseSection } from "@/components/landingPage/why-choose-section"
import { HowItWorksSection } from "@/components/landingPage/how-it-works-section"
import { WaitlistSection } from "@/components/landingPage/waitlist-section"
import { Footer } from "@/components/layout/footer"

export default function HomePage() {
  return (
    <main className="min-h-screen max-w-[1400px] mx-auto">
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
