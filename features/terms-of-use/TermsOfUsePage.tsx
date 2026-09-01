import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { TermsSection } from "./components/TermsSection"

export default function TermsOfUsePage() {
  return (
    <main className="min-h-screen">
      <Header />

      <section className="border-b bg-muted/30">
        <div className="container py-12 md:py-16">
          <div className="max-w-3xl mx-auto flex flex-col items-center">
            <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Terms of Use
            </h1>
            <p className="mt-3 text-muted-foreground text-center">
              Please read these terms carefully before using Ravenslaw. By accessing or using our
              services, you agree to be bound by these Terms of Use.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Last updated: September 27, 2025
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="container py-10 md:py-14">
          <div className="mx-auto grid max-w-3xl gap-6">
            <TermsSection
              title="1. Acceptance of Terms"
              description="By using Ravenslaw, you confirm that you have read, understood, and agree to these terms."
              className="text-foreground prose-headings:text-foreground prose-a:text-primary"
            >
              <p>
                If you do not agree to these terms, you must not use our website, applications, or any
                related services. These terms may be updated from time to time as described below.
              </p>
            </TermsSection>

            <TermsSection
              title="2. Eligibility"
              description="You must be legally capable of entering into binding agreements to use our services."
            >
              <ul className="list-disc pl-5 space-y-1">
                <li>You are at least the age of majority in your jurisdiction.</li>
                <li>You will use the services in compliance with applicable laws and regulations.</li>
              </ul>
            </TermsSection>

            <TermsSection
              title="3. User Accounts"
              description="You are responsible for maintaining the confidentiality of your account credentials."
            >
              <ul className="list-disc pl-5 space-y-1">
                <li>Provide accurate and complete registration information.</li>
                <li>Notify us immediately of any unauthorized use of your account.</li>
                <li>You are responsible for all activities that occur under your account.</li>
              </ul>
            </TermsSection>

            <TermsSection
              title="4. Prohibited Activities"
              description="To keep our platform safe and reliable, you agree not to misuse the services."
            >
              <ul className="list-disc pl-5 space-y-1">
                <li>Do not upload unlawful, harmful, or infringing content.</li>
                <li>Do not attempt to gain unauthorized access or disrupt service integrity.</li>
                <li>Do not reverse engineer or scrape data without permission.</li>
              </ul>
            </TermsSection>

            <TermsSection
              title="5. Intellectual Property"
              description="All content, trademarks, and technology on Ravenslaw are owned by us or our licensors."
            >
              <p>
                You are granted a limited, non-exclusive, non-transferable license to access and use the
                services solely for lawful, personal, or internal business purposes. No other rights are
                granted unless expressly stated.
              </p>
            </TermsSection>

            <TermsSection
              title="6. No Legal Advice"
              description="Information provided by the platform is for informational purposes and not legal advice."
            >
              <p>
                Ravenslaw is not a law firm and does not provide legal representation. Consult a qualified
                attorney for legal advice specific to your situation.
              </p>
            </TermsSection>

            <TermsSection
              title="7. Disclaimers"
              description="Our services are provided on an “as is” and “as available” basis without warranties."
            >
              <p>
                We disclaim all warranties, express or implied, including merchantability, fitness for a
                particular purpose, and non-infringement. We do not guarantee uninterrupted or error-free
                operation.
              </p>
            </TermsSection>

            <TermsSection
              title="8. Limitation of liability"
              description="To the maximum extent permitted by law, Ravenslaw shall not be liable for indirect or consequential damages."
            >
              <p>
                Our total liability for any claim arising out of or relating to these terms or the
                services will not exceed the amount you paid to use the services in the 12 months prior to
                the event giving rise to the claim.
              </p>
            </TermsSection>

            <TermsSection
              title="9. Governing Law"
              description="These terms are governed by the laws of the applicable jurisdiction, without regard to conflicts of law principles."
            >
              <p>
                You agree to submit to the exclusive jurisdiction of the courts located in the relevant
                jurisdiction for the resolution of any disputes.
              </p>
            </TermsSection>

            <TermsSection
              title="10. Changes to These Terms"
              description="We may update these terms from time to time. Material changes will be communicated appropriately."
            >
              <p>
                Your continued use of the services after changes become effective constitutes acceptance
                of the revised terms. We encourage you to review this page periodically.
              </p>
            </TermsSection>

            <TermsSection
              title="11. Contact Us"
              description="Questions about these Terms of Use? We’re here to help."
            >
              <p>
                Contact our support team at <a className="text-primary underline" href="mailto:support@ravenslaw.ai">support@ravenslaw.ai</a>.
              </p>
            </TermsSection>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
