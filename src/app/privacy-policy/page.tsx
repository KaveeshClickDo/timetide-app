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
              Last updated: February 2026
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
                At TimeTide, your privacy is fundamental to how we build and operate our platform. This Privacy Policy
                explains how SeekaHost Technologies Ltd. (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects,
                uses, discloses, and safeguards your information when you use the TimeTide scheduling platform,
                including our website, applications, and related services (collectively, the &quot;Service&quot;).
              </p>
            </div>

            {/* Table of Contents */}
            <div className="bg-gray-50 rounded-xl p-6 mb-12">
              <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">Table of Contents</h3>
              <ol className="list-decimal list-inside text-ocean-700 space-y-1 text-sm">
                <li><a href="#information-we-collect" className="hover:text-ocean-900 hover:underline">Information We Collect</a></li>
                <li><a href="#legal-basis" className="hover:text-ocean-900 hover:underline">Legal Basis for Processing (GDPR)</a></li>
                <li><a href="#how-we-use" className="hover:text-ocean-900 hover:underline">How We Use Your Information</a></li>
                <li><a href="#information-sharing" className="hover:text-ocean-900 hover:underline">Information Sharing and Disclosure</a></li>
                <li><a href="#cookies" className="hover:text-ocean-900 hover:underline">Cookies and Tracking Technologies</a></li>
                <li><a href="#data-security" className="hover:text-ocean-900 hover:underline">Data Security</a></li>
                <li><a href="#data-retention" className="hover:text-ocean-900 hover:underline">Data Retention</a></li>
                <li><a href="#your-rights" className="hover:text-ocean-900 hover:underline">Your Rights and Choices</a></li>
                <li><a href="#ccpa" className="hover:text-ocean-900 hover:underline">California Residents (CCPA/CPRA)</a></li>
                <li><a href="#international-transfers" className="hover:text-ocean-900 hover:underline">International Data Transfers</a></li>
                <li><a href="#third-party" className="hover:text-ocean-900 hover:underline">Third-Party Services and Integrations</a></li>
                <li><a href="#data-processing" className="hover:text-ocean-900 hover:underline">Data Processing Agreement</a></li>
                <li><a href="#children" className="hover:text-ocean-900 hover:underline">Children&apos;s Privacy</a></li>
                <li><a href="#automated-decisions" className="hover:text-ocean-900 hover:underline">Automated Decision-Making</a></li>
                <li><a href="#changes" className="hover:text-ocean-900 hover:underline">Changes to This Privacy Policy</a></li>
                <li><a href="#contact" className="hover:text-ocean-900 hover:underline">Contact Us</a></li>
              </ol>
            </div>

            {/* 1. Information We Collect */}
            <h2 id="information-we-collect" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              1. Information We Collect
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              1.1 Information You Provide
            </h3>
            <p className="text-gray-600 mb-4">
              When you create an account, use our services, or communicate with us, we collect information you voluntarily provide:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Account Information:</strong> Name, email address, password, username, and profile picture</li>
              <li><strong>Booking Information:</strong> Event types, meeting details, attendee names and email addresses, meeting notes, and custom form responses</li>
              <li><strong>Calendar Data:</strong> Calendar events, availability schedules, and timezone preferences when you connect external calendars</li>
              <li><strong>Payment Information:</strong> Billing address and payment details (processed securely through Stripe; we do not store full card numbers)</li>
              <li><strong>Communication Data:</strong> Messages you send through our platform, support requests, and feedback</li>
              <li><strong>Team Information:</strong> Team names, member roles, and organisational details for Team plan users</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              1.2 Information Collected Automatically
            </h3>
            <p className="text-gray-600 mb-4">
              When you access or use TimeTide, we automatically collect certain technical information:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Device Information:</strong> Browser type and version, operating system, device type, and screen resolution</li>
              <li><strong>Network Information:</strong> IP address, approximate location (city/country level), and internet service provider</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, clicks, time spent on pages, booking page views, and conversion rates</li>
              <li><strong>Log Data:</strong> Access times, error logs, referring URLs, and pages viewed before and after using our Service</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              1.3 Information from Third Parties
            </h3>
            <p className="text-gray-600 mb-4">
              We may receive information about you from third-party sources:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Calendar Providers:</strong> Event data from Google Calendar, Microsoft Outlook, or Apple Calendar when you connect them</li>
              <li><strong>Video Conferencing:</strong> Meeting links and metadata from Zoom, Google Meet, or Microsoft Teams</li>
              <li><strong>Payment Processors:</strong> Transaction confirmations and billing status from Stripe</li>
            </ul>

            {/* 2. Legal Basis for Processing */}
            <h2 id="legal-basis" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              2. Legal Basis for Processing (GDPR)
            </h2>
            <p className="text-gray-600 mb-4">
              If you are located in the European Economic Area (EEA) or the United Kingdom, we process your personal data based on the following legal grounds:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Performance of Contract (Article 6(1)(b)):</strong> Processing necessary to provide the TimeTide Service, manage your account, process bookings, and handle subscriptions</li>
              <li><strong>Legitimate Interests (Article 6(1)(f)):</strong> Processing for analytics, fraud prevention, service improvement, and direct marketing to existing customers. We balance our interests against your rights and freedoms</li>
              <li><strong>Consent (Article 6(1)(a)):</strong> Processing based on your explicit consent, such as marketing communications and non-essential cookies. You may withdraw consent at any time</li>
              <li><strong>Legal Obligation (Article 6(1)(c)):</strong> Processing required to comply with tax, accounting, or other legal requirements</li>
            </ul>

            {/* 3. How We Use Your Information */}
            <h2 id="how-we-use" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-gray-600 mb-4">
              We use the information we collect for the following purposes:
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              Service Delivery
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Provide, operate, and maintain the TimeTide scheduling platform</li>
              <li>Process and manage bookings, send confirmations, reminders, and notifications</li>
              <li>Synchronise your calendar data across connected services</li>
              <li>Handle subscription billing and payment processing</li>
              <li>Enable team scheduling, round-robin assignments, and collective events</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              Improvement and Analytics
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Analyse usage patterns to improve features and user experience</li>
              <li>Provide booking analytics and insights to account holders</li>
              <li>Monitor and improve platform performance and reliability</li>
              <li>Conduct A/B testing to optimise the Service</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              Communication
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Send transactional emails (booking confirmations, reminders, account updates)</li>
              <li>Respond to your support requests and inquiries</li>
              <li>Send product updates and feature announcements (with opt-out options)</li>
              <li>Send marketing communications (only with your consent)</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              Security and Compliance
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Detect, prevent, and address fraud, abuse, and security threats</li>
              <li>Enforce our Terms of Service and other policies</li>
              <li>Comply with applicable laws, regulations, and legal processes</li>
            </ul>

            {/* 4. Information Sharing and Disclosure */}
            <h2 id="information-sharing" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              4. Information Sharing and Disclosure
            </h2>
            <p className="text-gray-600 mb-4">
              We do not sell your personal information. We may share your data in the following limited circumstances:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-3 mb-6">
              <li><strong>With Booking Participants:</strong> When someone books a meeting with you, they can see your name, booking page details, and relevant meeting information. Similarly, when you book with others, the organiser receives your provided details.</li>
              <li><strong>With Team Members:</strong> If you are part of a team on TimeTide, other team members and administrators may see your availability, booking details, and scheduling data as configured by your team settings.</li>
              <li><strong>With Service Providers:</strong> We work with trusted third-party providers who assist in operating our Service, including cloud hosting (e.g., Vercel, AWS), email delivery, analytics, and payment processing (Stripe). These providers are contractually obligated to protect your data.</li>
              <li><strong>With Calendar and Conferencing Providers:</strong> When you connect Google Calendar, Microsoft Outlook, Zoom, or similar services, we share necessary data to synchronise your schedule and create meeting links.</li>
              <li><strong>For Legal Reasons:</strong> We may disclose information if required by law, subpoena, court order, or governmental request, or to protect the rights, property, or safety of TimeTide, our users, or the public.</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, reorganisation, or sale of assets, your information may be transferred. We will notify you before your data is subject to a different privacy policy.</li>
            </ul>

            {/* 5. Cookies and Tracking Technologies */}
            <h2 id="cookies" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              5. Cookies and Tracking Technologies
            </h2>
            <p className="text-gray-600 mb-4">
              We use cookies and similar technologies to enhance your experience. Below are the categories of cookies we use:
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Purpose</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Can be Disabled?</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Essential</td>
                    <td className="px-4 py-3">Authentication, security, core platform functionality</td>
                    <td className="px-4 py-3">No</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Functional</td>
                    <td className="px-4 py-3">Remembering preferences, timezone, language settings</td>
                    <td className="px-4 py-3">Yes</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Analytics</td>
                    <td className="px-4 py-3">Understanding usage patterns, page views, feature adoption</td>
                    <td className="px-4 py-3">Yes</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Marketing</td>
                    <td className="px-4 py-3">Measuring ad effectiveness and personalising content</td>
                    <td className="px-4 py-3">Yes</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-600 mb-6">
              You can manage your cookie preferences through your browser settings or our cookie consent banner.
              Note that disabling essential cookies may prevent you from using certain features of our Service.
            </p>

            {/* 6. Data Security */}
            <h2 id="data-security" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              6. Data Security
            </h2>
            <p className="text-gray-600 mb-4">
              We implement robust technical and organisational measures to protect your personal information:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Encryption:</strong> All data is encrypted in transit using TLS 1.2+ and at rest using AES-256 encryption</li>
              <li><strong>Authentication:</strong> Secure password hashing, optional two-factor authentication, and session management</li>
              <li><strong>Access Controls:</strong> Role-based access controls, principle of least privilege, and regular access reviews</li>
              <li><strong>Infrastructure:</strong> Hosted on SOC 2 compliant cloud infrastructure with regular security audits</li>
              <li><strong>Monitoring:</strong> Continuous security monitoring, intrusion detection, and incident response procedures</li>
              <li><strong>Employee Training:</strong> Regular security awareness training for all team members with access to personal data</li>
            </ul>
            <p className="text-gray-600 mb-6">
              While we strive to protect your information, no method of transmission over the internet is 100% secure.
              If you discover a security vulnerability, please report it to security@timetide.app.
            </p>

            {/* 7. Data Retention */}
            <h2 id="data-retention" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              7. Data Retention
            </h2>
            <p className="text-gray-600 mb-4">
              We retain your personal information only for as long as necessary to fulfil the purposes described in this policy:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Account Data:</strong> Retained for as long as your account is active. Upon account deletion, personal data is deleted or anonymised within 30 days</li>
              <li><strong>Booking Data:</strong> Retained for 12 months after the booking date for reference and analytics, then anonymised</li>
              <li><strong>Payment Records:</strong> Retained for 7 years to comply with UK tax and accounting regulations</li>
              <li><strong>Log Data:</strong> Retained for 90 days for security and debugging purposes</li>
              <li><strong>Marketing Consent Records:</strong> Retained for as long as the consent is valid, plus 3 years after withdrawal for compliance records</li>
            </ul>
            <p className="text-gray-600 mb-6">
              When data is no longer needed, it is securely deleted or irreversibly anonymised so it can no longer be associated with you.
            </p>

            {/* 8. Your Rights and Choices */}
            <h2 id="your-rights" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              8. Your Rights and Choices
            </h2>
            <p className="text-gray-600 mb-4">
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Right of Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Right to Rectification:</strong> Request correction of inaccurate or incomplete data</li>
              <li><strong>Right to Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
              <li><strong>Right to Data Portability:</strong> Receive your data in a structured, machine-readable format</li>
              <li><strong>Right to Object:</strong> Object to processing based on legitimate interests or for direct marketing</li>
              <li><strong>Right to Restrict Processing:</strong> Request limitation of processing in certain circumstances</li>
              <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent</li>
              <li><strong>Right to Lodge a Complaint:</strong> File a complaint with a supervisory authority (in the UK, this is the Information Commissioner&apos;s Office at <a href="https://ico.org.uk" className="text-ocean-600 hover:underline" target="_blank" rel="noopener noreferrer">ico.org.uk</a>)</li>
            </ul>
            <p className="text-gray-600 mb-4">
              To exercise any of these rights, please contact us at <a href="mailto:privacy@timetide.app" className="text-ocean-600 hover:underline">privacy@timetide.app</a>.
              We will respond to your request within 30 days (or within the timeframe required by applicable law).
            </p>
            <p className="text-gray-600 mb-6">
              You may also manage certain preferences directly in your account settings, including email notification preferences,
              connected calendar integrations, and profile visibility.
            </p>

            {/* 9. California Residents (CCPA/CPRA) */}
            <h2 id="ccpa" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              9. California Residents (CCPA/CPRA)
            </h2>
            <p className="text-gray-600 mb-4">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and
              the California Privacy Rights Act (CPRA):
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Right to Know:</strong> You can request details about the categories and specific pieces of personal information we collect, the purposes for collection, and the categories of third parties with whom we share it</li>
              <li><strong>Right to Delete:</strong> You can request deletion of your personal information, subject to certain exceptions</li>
              <li><strong>Right to Opt-Out of Sale:</strong> We do not sell your personal information. If this changes, we will provide a &quot;Do Not Sell My Personal Information&quot; link</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights</li>
              <li><strong>Right to Correct:</strong> You can request correction of inaccurate personal information</li>
              <li><strong>Right to Limit Use of Sensitive Personal Information:</strong> You can limit our use of sensitive personal information to what is necessary for providing the Service</li>
            </ul>
            <p className="text-gray-600 mb-6">
              To exercise your California privacy rights, contact us at <a href="mailto:privacy@timetide.app" className="text-ocean-600 hover:underline">privacy@timetide.app</a> or
              through your account settings. We will verify your identity before processing your request.
            </p>

            {/* 10. International Data Transfers */}
            <h2 id="international-transfers" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              10. International Data Transfers
            </h2>
            <p className="text-gray-600 mb-4">
              TimeTide is operated by SeekaHost Technologies Ltd., a company based in the United Kingdom.
              Your information may be transferred to and processed in countries other than your own, including
              countries that may not provide the same level of data protection.
            </p>
            <p className="text-gray-600 mb-4">
              When we transfer personal data outside the UK or EEA, we ensure appropriate safeguards are in place:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Adequacy Decisions:</strong> Transfers to countries recognised as providing adequate data protection</li>
              <li><strong>Standard Contractual Clauses (SCCs):</strong> EU/UK-approved contractual terms that require data recipients to protect your data</li>
              <li><strong>Data Processing Agreements:</strong> Binding agreements with all sub-processors that include appropriate transfer mechanisms</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Following the UK&apos;s departure from the EU, we comply with the UK GDPR and the Data Protection Act 2018 for
              transfers of personal data from the UK.
            </p>

            {/* 11. Third-Party Services and Integrations */}
            <h2 id="third-party" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              11. Third-Party Services and Integrations
            </h2>
            <p className="text-gray-600 mb-4">
              TimeTide integrates with various third-party services. When you connect these services, data may be shared
              as described below:
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Service</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Data Shared</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Google Calendar</td>
                    <td className="px-4 py-3">Calendar events, availability</td>
                    <td className="px-4 py-3">Calendar synchronisation</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Microsoft Outlook</td>
                    <td className="px-4 py-3">Calendar events, availability</td>
                    <td className="px-4 py-3">Calendar synchronisation</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Zoom</td>
                    <td className="px-4 py-3">Meeting links, participant info</td>
                    <td className="px-4 py-3">Video conferencing</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">Google Meet</td>
                    <td className="px-4 py-3">Meeting links</td>
                    <td className="px-4 py-3">Video conferencing</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Stripe</td>
                    <td className="px-4 py-3">Payment details, billing info</td>
                    <td className="px-4 py-3">Payment processing</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-600 mb-6">
              Each third-party service has its own privacy policy. We encourage you to review their policies before
              connecting your accounts. You can disconnect integrations at any time through your TimeTide settings.
            </p>

            {/* 12. Data Processing Agreement */}
            <h2 id="data-processing" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              12. Data Processing Agreement
            </h2>
            <p className="text-gray-600 mb-6">
              When you use TimeTide to schedule meetings with your clients or customers, you may act as a data controller
              and TimeTide acts as a data processor on your behalf. We offer a Data Processing Agreement (DPA) that
              governs how we handle personal data processed on your behalf, in compliance with GDPR requirements.
              To request a copy of our DPA, please contact <a href="mailto:legal@timetide.app" className="text-ocean-600 hover:underline">legal@timetide.app</a>.
            </p>

            {/* 13. Children's Privacy */}
            <h2 id="children" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              13. Children&apos;s Privacy
            </h2>
            <p className="text-gray-600 mb-6">
              TimeTide is not directed at children under the age of 16 (or 13 in jurisdictions where a lower age of
              consent applies). We do not knowingly collect personal information from children. If you are a parent
              or guardian and believe your child has provided us with personal information, please contact us at{' '}
              <a href="mailto:privacy@timetide.app" className="text-ocean-600 hover:underline">privacy@timetide.app</a>.
              We will promptly delete such information from our systems.
            </p>

            {/* 14. Automated Decision-Making */}
            <h2 id="automated-decisions" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              14. Automated Decision-Making
            </h2>
            <p className="text-gray-600 mb-6">
              TimeTide does not use automated decision-making or profiling that produces legal effects or significantly
              affects you. Our scheduling algorithms (such as round-robin assignment and availability matching) are
              functional tools that facilitate scheduling based on the rules you configure. You retain full control
              over your scheduling preferences and can adjust settings at any time.
            </p>

            {/* 15. Changes to This Privacy Policy */}
            <h2 id="changes" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              15. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-600 mb-6">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology,
              legal requirements, or other factors. When we make material changes, we will:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Update the &quot;Last updated&quot; date at the top of this page</li>
              <li>Notify you via email or through a prominent notice on our platform</li>
              <li>Where required by law, seek your consent to the changes</li>
            </ul>
            <p className="text-gray-600 mb-6">
              We encourage you to review this policy periodically. Your continued use of the Service after any
              changes constitutes acceptance of the updated policy.
            </p>

            {/* 16. Contact Us */}
            <h2 id="contact" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              16. Contact Us
            </h2>
            <p className="text-gray-600 mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices,
              please contact us:
            </p>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <p className="text-gray-700 mb-2"><strong>SeekaHost Technologies Ltd.</strong></p>
              <p className="text-gray-600 mb-1">Company Number: 16026964</p>
              <p className="text-gray-600 mb-1">VAT Number: 485829729</p>
              <p className="text-gray-600 mb-3">United Kingdom</p>
              <div className="border-t border-gray-200 pt-3 space-y-1">
                <p className="text-gray-600">Privacy enquiries: <a href="mailto:privacy@timetide.app" className="text-ocean-600 hover:underline">privacy@timetide.app</a></p>
                <p className="text-gray-600">Legal enquiries: <a href="mailto:legal@timetide.app" className="text-ocean-600 hover:underline">legal@timetide.app</a></p>
                <p className="text-gray-600">Security issues: <a href="mailto:security@timetide.app" className="text-ocean-600 hover:underline">security@timetide.app</a></p>
                <p className="text-gray-600">General support: <a href="mailto:hello@timetide.app" className="text-ocean-600 hover:underline">hello@timetide.app</a></p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-8 mt-12">
              <p className="text-gray-500 text-sm">
                By using TimeTide, you acknowledge that you have read and understood this Privacy Policy.
                If you do not agree with our practices, please discontinue use of the Service.
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
                <li><Link href="/contact-us" className="hover:text-white">Contact</Link></li>
                <li><Link href="#" className="hover:text-white">Blog</Link></li>
                <li><Link href="#" className="hover:text-white">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link href="/terms-conditions" className="hover:text-white">Terms of Service</Link></li>
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
