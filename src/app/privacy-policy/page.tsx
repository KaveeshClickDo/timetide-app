import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Privacy Policy - TimeTide',
  description: 'TimeTide Privacy Policy. Learn how we collect, use, and protect your personal information.',
}

export default function PrivacyPolicyPage() {
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
              Privacy Policy
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
                At TimeTide, we take your privacy seriously. This Privacy Policy explains how SeekaHost Technologies Ltd.
                (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, discloses, and safeguards your information when you use our
                scheduling platform.
              </p>
            </div>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              1. Information We Collect
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              1.1 Personal Information
            </h3>
            <p className="text-gray-600 mb-4">
              When you create an account or use our services, we may collect:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Name and email address</li>
              <li>Profile information (username, profile picture)</li>
              <li>Calendar data (when you connect external calendars)</li>
              <li>Booking information (meeting details, attendee information)</li>
              <li>Payment information (processed securely through third-party providers)</li>
              <li>Communication preferences</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              1.2 Automatically Collected Information
            </h3>
            <p className="text-gray-600 mb-4">
              When you access TimeTide, we automatically collect:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Device information (browser type, operating system)</li>
              <li>IP address and location data</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              2. How We Use Your Information
            </h2>
            <p className="text-gray-600 mb-4">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>To provide and maintain our scheduling services</li>
              <li>To process bookings and send notifications</li>
              <li>To sync with your connected calendars</li>
              <li>To personalise your experience</li>
              <li>To communicate with you about updates, features, and support</li>
              <li>To improve our services through analytics</li>
              <li>To detect and prevent fraud or abuse</li>
              <li>To comply with legal obligations</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              3. Information Sharing and Disclosure
            </h2>
            <p className="text-gray-600 mb-4">
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>With Booking Participants:</strong> When someone books a meeting with you, they can see your name, booking page details, and meeting information.</li>
              <li><strong>With Service Providers:</strong> We work with third-party providers for hosting, analytics, email delivery, and payment processing.</li>
              <li><strong>With Calendar Providers:</strong> When you connect Google Calendar, Outlook, or other calendars, we share necessary booking data.</li>
              <li><strong>For Legal Reasons:</strong> We may disclose information if required by law or to protect our rights.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger or acquisition, your information may be transferred.</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              4. Data Security
            </h2>
            <p className="text-gray-600 mb-6">
              We implement appropriate technical and organisational measures to protect your personal information:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Encryption of data in transit (TLS/SSL) and at rest</li>
              <li>Secure authentication mechanisms</li>
              <li>Regular security assessments and updates</li>
              <li>Access controls and employee training</li>
              <li>Incident response procedures</li>
            </ul>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              5. Data Retention
            </h2>
            <p className="text-gray-600 mb-6">
              We retain your personal information for as long as necessary to provide our services and fulfil the
              purposes described in this policy. When you delete your account, we will delete or anonymise your
              personal information within 30 days, except where we are required to retain it for legal or
              legitimate business purposes.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              6. Your Rights and Choices
            </h2>
            <p className="text-gray-600 mb-4">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your data</li>
              <li><strong>Portability:</strong> Request a portable copy of your data</li>
              <li><strong>Objection:</strong> Object to certain processing activities</li>
              <li><strong>Restriction:</strong> Request restriction of processing</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent</li>
            </ul>
            <p className="text-gray-600 mb-6">
              To exercise these rights, please contact us at privacy@timetide.app.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              7. Cookies and Tracking Technologies
            </h2>
            <p className="text-gray-600 mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Keep you signed in to your account</li>
              <li>Remember your preferences</li>
              <li>Understand how you use our services</li>
              <li>Improve performance and user experience</li>
            </ul>
            <p className="text-gray-600 mb-6">
              You can manage cookie preferences through your browser settings. Note that disabling certain
              cookies may affect the functionality of our services.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              8. International Data Transfers
            </h2>
            <p className="text-gray-600 mb-6">
              TimeTide is operated by SeekaHost Technologies Ltd., a company based in the United Kingdom.
              Your information may be transferred to and processed in countries other than your own.
              We ensure appropriate safeguards are in place for such transfers, including Standard
              Contractual Clauses approved by relevant authorities.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              9. Children&apos;s Privacy
            </h2>
            <p className="text-gray-600 mb-6">
              TimeTide is not intended for children under the age of 16. We do not knowingly collect
              personal information from children. If you believe we have collected information from
              a child, please contact us immediately.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              10. Third-Party Links and Integrations
            </h2>
            <p className="text-gray-600 mb-6">
              Our service may contain links to third-party websites or integrate with third-party
              services (such as Google Calendar, Outlook, or Zoom). We are not responsible for the
              privacy practices of these third parties. We encourage you to review their privacy
              policies before providing any information.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              11. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-600 mb-6">
              We may update this Privacy Policy from time to time. We will notify you of any material
              changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
              We encourage you to review this policy periodically.
            </p>

            <h2 className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              12. Contact Us
            </h2>
            <p className="text-gray-600 mb-4">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <p className="text-gray-700 mb-2"><strong>SeekaHost Technologies Ltd.</strong></p>
              <p className="text-gray-600 mb-1">Company Number: 16026964</p>
              <p className="text-gray-600 mb-1">VAT Number: 485829729</p>
              <p className="text-gray-600 mb-1">Email: privacy@timetide.app</p>
              <p className="text-gray-600">United Kingdom</p>
            </div>

            <div className="border-t border-gray-200 pt-8 mt-12">
              <p className="text-gray-500 text-sm">
                By using TimeTide, you acknowledge that you have read and understood this Privacy Policy.
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
