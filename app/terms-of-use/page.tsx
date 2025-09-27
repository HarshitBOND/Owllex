import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function TermsOfUse() {
  return (
    <main className="min-h-screen">
      <Header />

      {/* Page Hero */}
      <section className="border-b bg-muted/30">
        <div className="container py-12 md:py-16">
          <div className="max-w-3xl mx-auto flex flex-col items-center">
            <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Terms of Use
            </h1>
            <p className="mt-3 text-muted-foreground text-center">
              Please read these terms carefully before using Lexvert. By accessing or using our
              services, you agree to be bound by these Terms of Use.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Last updated: September 27, 2025
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section>
        <div className="container py-10 md:py-14">
          <div className="mx-auto grid max-w-3xl gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">1. Acceptance of Terms</CardTitle>
                <CardDescription>
                  By using Lexvert, you confirm that you have read, understood, and agree to these terms.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary">
                <p>
                  If you do not agree to these terms, you must not use our website, applications, or any
                  related services. These terms may be updated from time to time as described below.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">2. Eligibility</CardTitle>
                <CardDescription>
                  You must be legally capable of entering into binding agreements to use our services.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <ul className="list-disc pl-5 space-y-1">
                  <li>You are at least the age of majority in your jurisdiction.</li>
                  <li>You will use the services in compliance with applicable laws and regulations.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">3. User Accounts</CardTitle>
                <CardDescription>
                  You are responsible for maintaining the confidentiality of your account credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Provide accurate and complete registration information.</li>
                  <li>Notify us immediately of any unauthorized use of your account.</li>
                  <li>You are responsible for all activities that occur under your account.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">4. Prohibited Activities</CardTitle>
                <CardDescription>
                  To keep our platform safe and reliable, you agree not to misuse the services.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Do not upload unlawful, harmful, or infringing content.</li>
                  <li>Do not attempt to gain unauthorized access or disrupt service integrity.</li>
                  <li>Do not reverse engineer or scrape data without permission.</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">5. Intellectual Property</CardTitle>
                <CardDescription>
                  All content, trademarks, and technology on Lexvert are owned by us or our licensors.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  You are granted a limited, non-exclusive, non-transferable license to access and use the
                  services solely for lawful, personal, or internal business purposes. No other rights are
                  granted unless expressly stated.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">6. No Legal Advice</CardTitle>
                <CardDescription>
                  Information provided by the platform is for informational purposes and not legal advice.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  Lexvert is not a law firm and does not provide legal representation. Consult a qualified
                  attorney for legal advice specific to your situation.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">7. Disclaimers</CardTitle>
                <CardDescription>
                  Our services are provided on an “as is” and “as available” basis without warranties.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  We disclaim all warranties, express or implied, including merchantability, fitness for a
                  particular purpose, and non-infringement. We do not guarantee uninterrupted or error-free
                  operation.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">8. Limitation of liability</CardTitle>
                <CardDescription>
                  To the maximum extent permitted by law, Lexvert shall not be liable for indirect or
                  consequential damages.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  Our total liability for any claim arising out of or relating to these terms or the
                  services will not exceed the amount you paid to use the services in the 12 months prior to
                  the event giving rise to the claim.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">9. Governing Law</CardTitle>
                <CardDescription>
                  These terms are governed by the laws of the applicable jurisdiction, without regard to
                  conflicts of law principles.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  You agree to submit to the exclusive jurisdiction of the courts located in the relevant
                  jurisdiction for the resolution of any disputes.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">10. Changes to These Terms</CardTitle>
                <CardDescription>
                  We may update these terms from time to time. Material changes will be communicated
                  appropriately.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  Your continued use of the services after changes become effective constitutes acceptance
                  of the revised terms. We encourage you to review this page periodically.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">11. Contact Us</CardTitle>
                <CardDescription>
                  Questions about these Terms of Use? We’re here to help.
                </CardDescription>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p>
                  Contact our support team at <a className="text-primary underline" href="mailto:support@lexvert.ai">support@lexvert.ai</a>.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
