import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Terms and Conditions - TimeTide',
  description: 'TimeTide Terms and Conditions. Read our terms of service governing your use of the TimeTide scheduling platform.',
}

export default function TermsConditionsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-ocean-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/">
                <Image src="/header-logo.svg" alt="TimeTide" width={150} height={40} />
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <Link
                href="/#features"
                className="text-gray-600 hover:text-ocean-600 transition-colors"
              >
                Features
              </Link>
              <Link
                href="/#how-it-works"
                className="text-gray-600 hover:text-ocean-600 transition-colors"
              >
                How It Works
              </Link>
              <Link
                href="/#pricing"
                className="text-gray-600 hover:text-ocean-600 transition-colors"
              >
                Pricing
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/auth/signin">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/auth/signup">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header Section */}
      <section className="relative pt-32 pb-12 overflow-hidden">
        <div className="absolute inset-0 ocean-bg-animated opacity-20" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-heading font-bold text-gray-900 mb-4">
              Terms and Conditions
            </h1>
            <p className="text-gray-600">
              Last updated: January 2026
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-12 pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg max-w-none">
            <div className="bg-ocean-50 border border-ocean-200 rounded-xl p-6 mb-8">
              <p className="text-ocean-800 m-0">
                Please read these Terms and Conditions (&quot;Terms&quot;) carefully before using the TimeTide scheduling
                platform operated by SeekaHost Technologies Ltd. (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
                By accessing or using our service, you agree to be bound by these Terms.
              </p>
            </div>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-600 mb-6">
              By creating an account or using TimeTide, you agree to these Terms and our Privacy Policy.
              If you do not agree to these Terms, you may not access or use our services. We reserve the
              right to modify these Terms at any time. Continued use of the service after changes constitutes
              acceptance of the new Terms.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              2. Description of Service
            </h2>
            <p className="text-gray-600 mb-4">
              TimeTide is a scheduling platform that allows users to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Create and manage booking pages for appointments and meetings</li>
              <li>Set availability schedules and preferences</li>
              <li>Integrate with external calendar services (Google Calendar, Outlook, etc.)</li>
              <li>Send automated notifications and reminders</li>
              <li>Manage team scheduling and round-robin assignments</li>
              <li>Access booking analytics and insights</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              3. Account Registration
            </h2>
            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              3.1 Account Creation
            </h3>
            <p className="text-gray-600 mb-6">
              To use TimeTide, you must create an account by providing accurate and complete information.
              You are responsible for maintaining the confidentiality of your account credentials and for
              all activities that occur under your account.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              3.2 Account Requirements
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>You must be at least 16 years old to create an account</li>
              <li>You must provide a valid email address</li>
              <li>You must not create multiple accounts for abusive purposes</li>
              <li>You must not impersonate another person or entity</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              3.3 Account Security
            </h3>
            <p className="text-gray-600 mb-6">
              You are responsible for safeguarding your account credentials. You must notify us immediately
              of any unauthorised access to your account. We are not liable for any loss or damage arising
              from your failure to protect your account.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              4. User Responsibilities
            </h2>
            <p className="text-gray-600 mb-4">
              When using TimeTide, you agree to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Use the service only for lawful purposes</li>
              <li>Respect the rights and privacy of other users</li>
              <li>Honour bookings made through your scheduling pages</li>
              <li>Provide accurate information about your availability and services</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              5. Prohibited Activities
            </h2>
            <p className="text-gray-600 mb-4">
              You may not use TimeTide to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon intellectual property rights of others</li>
              <li>Transmit harmful code, malware, or viruses</li>
              <li>Attempt to gain unauthorised access to our systems</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Send spam, unsolicited communications, or engage in harassment</li>
              <li>Collect user information without consent</li>
              <li>Resell or redistribute the service without authorisation</li>
              <li>Use automated tools to access the service (except approved integrations)</li>
              <li>Circumvent any security measures or access controls</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              6. Subscription Plans and Payments
            </h2>
            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              6.1 Free and Paid Plans
            </h3>
            <p className="text-gray-600 mb-6">
              TimeTide offers both free and paid subscription plans. Features and limitations vary by plan.
              Details of current plans are available on our pricing page.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              6.2 Billing
            </h3>
            <p className="text-gray-600 mb-6">
              Paid subscriptions are billed in advance on a monthly or annual basis. You authorise us to
              charge your payment method for all fees due. Prices are subject to change with reasonable notice.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              6.3 Cancellation and Refunds
            </h3>
            <p className="text-gray-600 mb-6">
              You may cancel your subscription at any time through your account settings. Cancellation takes
              effect at the end of the current billing period. Refunds are provided in accordance with our
              refund policy and applicable consumer protection laws.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              7. Intellectual Property
            </h2>
            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              7.1 Our Intellectual Property
            </h3>
            <p className="text-gray-600 mb-6">
              TimeTide, including its logo, design, features, and content, is owned by SeekaHost Technologies Ltd.
              and is protected by intellectual property laws. You may not copy, modify, distribute, or create
              derivative works without our express written permission.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              7.2 Your Content
            </h3>
            <p className="text-gray-600 mb-6">
              You retain ownership of content you create or upload to TimeTide. By using our service, you
              grant us a limited licence to host, display, and transmit your content as necessary to provide
              the service. You represent that you have the right to share any content you upload.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              8. Third-Party Integrations
            </h2>
            <p className="text-gray-600 mb-6">
              TimeTide integrates with third-party services including Google Calendar, Microsoft Outlook,
              Zoom, and others. Your use of these integrations is subject to the respective third-party
              terms and privacy policies. We are not responsible for the actions, content, or policies
              of third-party services.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              9. Availability and Service Level
            </h2>
            <p className="text-gray-600 mb-6">
              We strive to maintain high availability of our service but do not guarantee uninterrupted
              access. We may perform maintenance, updates, or experience technical issues that temporarily
              affect service availability. We will make reasonable efforts to notify users of planned
              maintenance in advance.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              10. Limitation of Liability
            </h2>
            <p className="text-gray-600 mb-6">
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>TimeTide is provided &quot;as is&quot; without warranties of any kind, express or implied</li>
              <li>We do not warrant that the service will be error-free or uninterrupted</li>
              <li>We are not liable for any indirect, incidental, special, or consequential damages</li>
              <li>Our total liability shall not exceed the amount paid by you in the preceding 12 months</li>
              <li>We are not responsible for missed meetings, scheduling conflicts, or business losses resulting from service use</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              11. Indemnification
            </h2>
            <p className="text-gray-600 mb-6">
              You agree to indemnify and hold harmless SeekaHost Technologies Ltd., its officers, directors,
              employees, and agents from any claims, damages, losses, or expenses (including legal fees)
              arising from your use of the service, violation of these Terms, or infringement of any
              third-party rights.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              12. Termination
            </h2>
            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              12.1 Termination by You
            </h3>
            <p className="text-gray-600 mb-6">
              You may terminate your account at any time by deleting your account through the settings
              page or contacting our support team.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              12.2 Termination by Us
            </h3>
            <p className="text-gray-600 mb-6">
              We may suspend or terminate your account if you violate these Terms, engage in prohibited
              activities, or fail to pay subscription fees. We may also terminate accounts that have been
              inactive for an extended period.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              12.3 Effect of Termination
            </h3>
            <p className="text-gray-600 mb-6">
              Upon termination, your right to access the service ceases immediately. We may delete your
              data in accordance with our data retention policy. Provisions that should survive termination
              (such as liability limitations) will remain in effect.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              13. Dispute Resolution
            </h2>
            <p className="text-gray-600 mb-6">
              Any disputes arising from these Terms or your use of TimeTide shall be resolved through
              good-faith negotiations. If negotiations fail, disputes shall be resolved through binding
              arbitration or the courts of England and Wales, at our discretion.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              14. Governing Law
            </h2>
            <p className="text-gray-600 mb-6">
              These Terms shall be governed by and construed in accordance with the laws of England and
              Wales, without regard to conflict of law principles. The courts of England and Wales shall
              have exclusive jurisdiction over any disputes.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              15. Changes to Terms
            </h2>
            <p className="text-gray-600 mb-6">
              We reserve the right to modify these Terms at any time. Material changes will be communicated
              via email or through prominent notice on our platform. Your continued use of the service
              after changes take effect constitutes acceptance of the new Terms.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              16. Severability
            </h2>
            <p className="text-gray-600 mb-6">
              If any provision of these Terms is found to be invalid or unenforceable, the remaining
              provisions shall continue in full force and effect. The invalid provision shall be modified
              to the minimum extent necessary to make it valid and enforceable.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              17. Entire Agreement
            </h2>
            <p className="text-gray-600 mb-6">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you
              and SeekaHost Technologies Ltd. regarding your use of TimeTide. Any prior agreements or
              understandings are superseded by these Terms.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              18. Contact Information
            </h2>
            <p className="text-gray-600 mb-4">
              If you have any questions about these Terms, please contact us:
            </p>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <p className="text-gray-700 mb-2"><strong>SeekaHost Technologies Ltd.</strong></p>
              <p className="text-gray-600 mb-1">Company Number: 16026964</p>
              <p className="text-gray-600 mb-1">VAT Number: 485829729</p>
              <p className="text-gray-600 mb-1">Email: legal@timetide.app</p>
              <p className="text-gray-600">United Kingdom</p>
            </div>

            <div className="border-t border-gray-200 pt-8 mt-12">
              <p className="text-gray-500 text-sm">
                By using TimeTide, you acknowledge that you have read, understood, and agree to be bound
                by these Terms and Conditions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center mb-4">
                <Image src="/footer-logo.svg" alt="TimeTide" width={120} height={32} />
              </div>
              <p className="text-sm">
                Modern scheduling that flows with your time.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/#features" className="hover:text-white">Features</Link></li>
                <li><Link href="/#pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="#" className="hover:text-white">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/about-us" className="hover:text-white">About</Link></li>
                <li><Link href="#" className="hover:text-white">Blog</Link></li>
                <li><Link href="#" className="hover:text-white">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy-policy" className="hover:text-white">Privacy</Link></li>
                <li><Link href="/terms-conditions" className="hover:text-white">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            © {new Date().getFullYear()} TimeTide by SeekaHost Technologies Ltd. All Rights Reserved.
            <br />
            Company Number: 16026964. VAT Number: 485829729.
          </div>
        </div>
      </footer>
    </div>
  )
}
