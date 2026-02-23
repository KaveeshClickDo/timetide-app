import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Terms of Service - TimeTide',
  description: 'TimeTide Terms of Service. Read the terms governing your use of the TimeTide scheduling platform.',
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
              Terms of Service
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
                Please read these Terms of Service (&quot;Terms&quot;) carefully before using the TimeTide scheduling
                platform operated by SeekaHost Technologies Ltd. (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
                By accessing or using our Service, you agree to be bound by these Terms. If you do not agree,
                you must not access or use the Service.
              </p>
            </div>

            {/* Table of Contents */}
            <div className="bg-gray-50 rounded-xl p-6 mb-12">
              <h3 className="text-lg font-heading font-semibold text-gray-900 mb-4">Table of Contents</h3>
              <ol className="list-decimal list-inside text-ocean-700 space-y-1 text-sm">
                <li><a href="#acceptance" className="hover:text-ocean-900 hover:underline">Acceptance of Terms</a></li>
                <li><a href="#description" className="hover:text-ocean-900 hover:underline">Description of Service</a></li>
                <li><a href="#account" className="hover:text-ocean-900 hover:underline">Account Registration and Security</a></li>
                <li><a href="#plans" className="hover:text-ocean-900 hover:underline">Subscription Plans and Payments</a></li>
                <li><a href="#acceptable-use" className="hover:text-ocean-900 hover:underline">Acceptable Use Policy</a></li>
                <li><a href="#prohibited" className="hover:text-ocean-900 hover:underline">Prohibited Activities</a></li>
                <li><a href="#content" className="hover:text-ocean-900 hover:underline">User Content and Intellectual Property</a></li>
                <li><a href="#integrations" className="hover:text-ocean-900 hover:underline">Third-Party Integrations</a></li>
                <li><a href="#api" className="hover:text-ocean-900 hover:underline">API Usage</a></li>
                <li><a href="#team" className="hover:text-ocean-900 hover:underline">Team and Organisation Accounts</a></li>
                <li><a href="#availability" className="hover:text-ocean-900 hover:underline">Service Availability and Support</a></li>
                <li><a href="#privacy" className="hover:text-ocean-900 hover:underline">Privacy and Data Protection</a></li>
                <li><a href="#liability" className="hover:text-ocean-900 hover:underline">Limitation of Liability</a></li>
                <li><a href="#warranty" className="hover:text-ocean-900 hover:underline">Disclaimer of Warranties</a></li>
                <li><a href="#indemnification" className="hover:text-ocean-900 hover:underline">Indemnification</a></li>
                <li><a href="#termination" className="hover:text-ocean-900 hover:underline">Termination</a></li>
                <li><a href="#disputes" className="hover:text-ocean-900 hover:underline">Dispute Resolution and Governing Law</a></li>
                <li><a href="#force-majeure" className="hover:text-ocean-900 hover:underline">Force Majeure</a></li>
                <li><a href="#general" className="hover:text-ocean-900 hover:underline">General Provisions</a></li>
                <li><a href="#changes" className="hover:text-ocean-900 hover:underline">Changes to Terms</a></li>
                <li><a href="#contact" className="hover:text-ocean-900 hover:underline">Contact Information</a></li>
              </ol>
            </div>

            {/* 1. Acceptance of Terms */}
            <h2 id="acceptance" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-gray-600 mb-4">
              By creating an account, accessing, or using TimeTide (the &quot;Service&quot;), you confirm that you:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Are at least 16 years old (or the minimum age required in your jurisdiction)</li>
              <li>Have the legal capacity to enter into a binding agreement</li>
              <li>Agree to comply with these Terms and our <Link href="/privacy-policy" className="text-ocean-600 hover:underline">Privacy Policy</Link></li>
              <li>If accepting on behalf of an organisation, have the authority to bind that organisation to these Terms</li>
            </ul>
            <p className="text-gray-600 mb-6">
              We reserve the right to modify these Terms at any time. Material changes will be communicated
              via email or prominent notice on the platform. Your continued use of the Service after changes
              take effect constitutes acceptance of the updated Terms.
            </p>

            {/* 2. Description of Service */}
            <h2 id="description" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              2. Description of Service
            </h2>
            <p className="text-gray-600 mb-4">
              TimeTide is a cloud-based scheduling platform that enables professionals and teams to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Create and share customisable booking pages for appointments and meetings</li>
              <li>Set and manage availability schedules with timezone detection</li>
              <li>Integrate with external calendar services (Google Calendar, Microsoft Outlook, Apple Calendar)</li>
              <li>Generate video conferencing links (Zoom, Google Meet, Microsoft Teams)</li>
              <li>Send automated email notifications, confirmations, and reminders</li>
              <li>Manage team scheduling with round-robin and collective event assignments</li>
              <li>Access booking analytics, insights, and reporting</li>
              <li>Configure buffer times, date-specific overrides, and custom booking forms</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Features vary by subscription plan. See our <Link href="/#pricing" className="text-ocean-600 hover:underline">pricing page</Link> for
              current plan details and feature availability.
            </p>

            {/* 3. Account Registration and Security */}
            <h2 id="account" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              3. Account Registration and Security
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              3.1 Account Creation
            </h3>
            <p className="text-gray-600 mb-6">
              To access most features of TimeTide, you must create an account by providing accurate, current,
              and complete information. You agree to update your account information promptly if it changes.
              Providing false or misleading information may result in account suspension or termination.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              3.2 Account Requirements
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>You must be at least 16 years old to create an account</li>
              <li>You must provide a valid and accessible email address</li>
              <li>You must verify your email address before accessing certain features</li>
              <li>You must not create multiple accounts for abusive or deceptive purposes</li>
              <li>You must not use another person&apos;s account without authorisation</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              3.3 Account Security
            </h3>
            <p className="text-gray-600 mb-6">
              You are responsible for maintaining the confidentiality and security of your account credentials.
              You must use a strong password and notify us immediately at{' '}
              <a href="mailto:support@timetide.app" className="text-ocean-600 hover:underline">support@timetide.app</a>{' '}
              if you suspect any unauthorised access to your account. We are not liable for any loss or damage
              arising from unauthorised use of your account due to your failure to protect your credentials.
            </p>

            {/* 4. Subscription Plans and Payments */}
            <h2 id="plans" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              4. Subscription Plans and Payments
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              4.1 Free and Paid Plans
            </h3>
            <p className="text-gray-600 mb-6">
              TimeTide offers a free plan with limited features and paid subscription plans (Pro and Team) with
              additional capabilities. The features, limitations, and pricing for each plan are described on our
              pricing page and may be updated from time to time.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              4.2 Billing and Payment
            </h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Paid subscriptions are billed in advance on a monthly or annual basis</li>
              <li>You authorise us to charge your selected payment method for all applicable fees</li>
              <li>All prices are displayed in USD and are exclusive of applicable taxes unless stated otherwise</li>
              <li>Payment is processed securely through Stripe. We do not store your full payment card details</li>
              <li>Failed payments may result in service interruption or downgrade to the free plan</li>
            </ul>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              4.3 Price Changes
            </h3>
            <p className="text-gray-600 mb-6">
              We may adjust pricing with at least 30 days&apos; advance notice. Price changes will take effect at
              the start of your next billing cycle. If you do not agree with the new pricing, you may cancel
              your subscription before the changes take effect.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              4.4 Cancellation and Refunds
            </h3>
            <p className="text-gray-600 mb-6">
              You may cancel your subscription at any time through your account settings or by contacting support.
              Cancellation takes effect at the end of the current billing period — you will retain access to paid
              features until then. Refunds are provided in accordance with applicable consumer protection laws.
              For annual subscriptions, you may request a pro-rata refund within 14 days of purchase.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              4.5 Free Trials
            </h3>
            <p className="text-gray-600 mb-6">
              We may offer free trial periods for paid plans. At the end of a trial, your subscription will
              automatically convert to a paid plan unless you cancel before the trial expires. We will send
              a reminder before the trial ends.
            </p>

            {/* 5. Acceptable Use Policy */}
            <h2 id="acceptable-use" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              5. Acceptable Use Policy
            </h2>
            <p className="text-gray-600 mb-4">
              When using TimeTide, you agree to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Use the Service only for lawful scheduling and meeting management purposes</li>
              <li>Respect the rights, privacy, and dignity of other users and booking participants</li>
              <li>Honour bookings made through your scheduling pages in good faith</li>
              <li>Provide accurate information about your availability, services, and identity</li>
              <li>Comply with all applicable local, national, and international laws and regulations</li>
              <li>Use integrations (calendar, video conferencing) only as intended and authorised</li>
              <li>Maintain the security of your account and promptly report any breaches</li>
            </ul>

            {/* 6. Prohibited Activities */}
            <h2 id="prohibited" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              6. Prohibited Activities
            </h2>
            <p className="text-gray-600 mb-4">
              You must not use TimeTide to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Send spam, unsolicited communications, or engage in harassment through booking pages</li>
              <li>Transmit malicious code, viruses, or harmful software</li>
              <li>Attempt to gain unauthorised access to our systems, other accounts, or connected services</li>
              <li>Interfere with, disrupt, or place an unreasonable burden on the Service or its infrastructure</li>
              <li>Scrape, crawl, or use automated tools to extract data (except through our approved API)</li>
              <li>Impersonate another person, entity, or misrepresent your affiliation</li>
              <li>Resell, sublicense, or redistribute the Service without written authorisation</li>
              <li>Use the Service for competing product development, benchmarking, or reverse engineering</li>
              <li>Circumvent any security measures, rate limits, or access controls</li>
              <li>Create booking pages for illegal services or content that violates our community standards</li>
              <li>Abuse free trial offers by creating multiple accounts</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Violation of these restrictions may result in immediate account suspension or termination
              without notice or refund.
            </p>

            {/* 7. User Content and Intellectual Property */}
            <h2 id="content" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              7. User Content and Intellectual Property
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              7.1 Our Intellectual Property
            </h3>
            <p className="text-gray-600 mb-6">
              The TimeTide platform, including its name, logo, design, source code, features, documentation,
              and all associated content, is owned by SeekaHost Technologies Ltd. and is protected by copyright,
              trademark, and other intellectual property laws. You may not copy, modify, distribute, sell, or
              create derivative works of any part of our Service without express written permission.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              7.2 Your Content
            </h3>
            <p className="text-gray-600 mb-6">
              You retain full ownership of content you create or upload to TimeTide, including event type
              descriptions, booking page content, profile information, and custom branding. By using our
              Service, you grant us a limited, non-exclusive, worldwide licence to host, display, reproduce,
              and transmit your content solely as necessary to provide and improve the Service. This licence
              terminates when you delete your content or close your account.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              7.3 Feedback
            </h3>
            <p className="text-gray-600 mb-6">
              If you provide feedback, suggestions, or ideas about the Service, you grant us a perpetual,
              irrevocable, royalty-free licence to use, modify, and incorporate such feedback into our
              products and services without obligation to you.
            </p>

            {/* 8. Third-Party Integrations */}
            <h2 id="integrations" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              8. Third-Party Integrations
            </h2>
            <p className="text-gray-600 mb-4">
              TimeTide integrates with third-party services including but not limited to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Calendar Services:</strong> Google Calendar, Microsoft Outlook, Apple Calendar</li>
              <li><strong>Video Conferencing:</strong> Zoom, Google Meet, Microsoft Teams</li>
              <li><strong>Payment Processing:</strong> Stripe</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Your use of third-party integrations is subject to the respective third-party terms of service
              and privacy policies. We are not responsible for the availability, accuracy, or actions of
              third-party services. If a third-party service experiences downtime or changes its API, it may
              temporarily affect TimeTide features that depend on that service. You may connect or disconnect
              integrations at any time through your account settings.
            </p>

            {/* 9. API Usage */}
            <h2 id="api" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              9. API Usage
            </h2>
            <p className="text-gray-600 mb-4">
              TimeTide provides API access for eligible subscription plans (Team plan and above). If you use our API, you agree to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Use the API only for purposes consistent with these Terms and our API documentation</li>
              <li>Respect rate limits and usage quotas as specified in our API documentation</li>
              <li>Keep your API keys confidential and not share them with unauthorised parties</li>
              <li>Not use the API to build a competing scheduling service</li>
              <li>Include appropriate attribution when displaying TimeTide data in external applications</li>
              <li>Handle end-user data obtained through the API in compliance with applicable privacy laws</li>
            </ul>
            <p className="text-gray-600 mb-6">
              We reserve the right to throttle, suspend, or revoke API access if we detect abuse, excessive usage,
              or violations of these Terms. API features and endpoints may change; we will provide reasonable
              notice of breaking changes.
            </p>

            {/* 10. Team and Organisation Accounts */}
            <h2 id="team" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              10. Team and Organisation Accounts
            </h2>
            <p className="text-gray-600 mb-4">
              If you create or join a team account on TimeTide:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li><strong>Team Administrators</strong> are responsible for managing team members, permissions, and billing</li>
              <li><strong>Team Members</strong> must comply with these Terms and any additional policies set by their team administrator</li>
              <li>Team administrators may have access to team members&apos; scheduling data, booking analytics, and activity within the team workspace</li>
              <li>When a team member leaves a team, their personal account remains active but team-specific data may be retained by the team</li>
              <li>The entity that creates and pays for a team account is responsible for all fees incurred by team members</li>
            </ul>

            {/* 11. Service Availability and Support */}
            <h2 id="availability" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              11. Service Availability and Support
            </h2>
            <p className="text-gray-600 mb-4">
              We strive to maintain high availability but do not guarantee uninterrupted access to the Service:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>We target 99.9% uptime but do not offer a formal Service Level Agreement (SLA) at this time</li>
              <li>Scheduled maintenance will be communicated in advance when possible</li>
              <li>We are not liable for service interruptions caused by factors beyond our reasonable control</li>
              <li>Support is available via email at <a href="mailto:support@timetide.app" className="text-ocean-600 hover:underline">support@timetide.app</a></li>
              <li>Response times vary by plan: Free (best effort), Pro (within 24 hours), Team (within 4 hours on business days)</li>
            </ul>

            {/* 12. Privacy and Data Protection */}
            <h2 id="privacy" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              12. Privacy and Data Protection
            </h2>
            <p className="text-gray-600 mb-6">
              Our collection and use of personal information is governed by our{' '}
              <Link href="/privacy-policy" className="text-ocean-600 hover:underline">Privacy Policy</Link>,
              which is incorporated into these Terms by reference. By using the Service, you consent to the
              collection and processing of your data as described in the Privacy Policy. If you use TimeTide
              to schedule meetings with your own clients or customers, you are responsible for ensuring your
              use complies with applicable data protection laws (including GDPR and CCPA where applicable).
            </p>

            {/* 13. Limitation of Liability */}
            <h2 id="liability" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              13. Limitation of Liability
            </h2>
            <p className="text-gray-600 mb-4">
              To the maximum extent permitted by applicable law:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Our total aggregate liability for any claims arising from the Service shall not exceed the greater of (a) the amount you paid us in the 12 months preceding the claim, or (b) £100</li>
              <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages</li>
              <li>We are not liable for lost profits, data loss, business interruption, or missed meetings arising from use of the Service</li>
              <li>We are not responsible for scheduling conflicts, double bookings, or communication failures caused by third-party integrations</li>
              <li>We are not liable for actions taken by other users or booking participants</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Nothing in these Terms excludes or limits our liability for death or personal injury caused by
              our negligence, fraud or fraudulent misrepresentation, or any other liability that cannot be
              excluded or limited by English law.
            </p>

            {/* 14. Disclaimer of Warranties */}
            <h2 id="warranty" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              14. Disclaimer of Warranties
            </h2>
            <p className="text-gray-600 mb-6">
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties
              of any kind, whether express, implied, or statutory. We specifically disclaim all implied warranties
              of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that
              the Service will be uninterrupted, error-free, secure, or free of harmful components. No advice or
              information obtained from us shall create any warranty not expressly stated in these Terms. Your use
              of the Service is at your sole risk.
            </p>

            {/* 15. Indemnification */}
            <h2 id="indemnification" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              15. Indemnification
            </h2>
            <p className="text-gray-600 mb-6">
              You agree to indemnify, defend, and hold harmless SeekaHost Technologies Ltd., its officers,
              directors, employees, agents, and affiliates from and against any claims, damages, losses,
              liabilities, costs, and expenses (including reasonable legal fees) arising from or related to:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Your use of or inability to use the Service</li>
              <li>Your violation of these Terms or any applicable law</li>
              <li>Your content or information submitted through the Service</li>
              <li>Your infringement of any third-party rights</li>
              <li>Any dispute between you and a booking participant or team member</li>
            </ul>

            {/* 16. Termination */}
            <h2 id="termination" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              16. Termination
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              16.1 Termination by You
            </h3>
            <p className="text-gray-600 mb-6">
              You may terminate your account at any time by deleting your account through the settings page
              or by contacting our support team at{' '}
              <a href="mailto:support@timetide.app" className="text-ocean-600 hover:underline">support@timetide.app</a>.
              Active subscriptions will remain in effect until the end of the current billing period.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              16.2 Termination by Us
            </h3>
            <p className="text-gray-600 mb-6">
              We may suspend or terminate your account if you:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>Violate these Terms or our Acceptable Use Policy</li>
              <li>Engage in fraudulent or illegal activity</li>
              <li>Fail to pay subscription fees after reasonable notice</li>
              <li>Have an account that has been inactive for more than 12 months (free accounts)</li>
              <li>Pose a risk to the security or integrity of the Service or other users</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Where possible, we will provide notice and an opportunity to remedy the violation before
              terminating your account, except in cases of serious violations or security threats.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              16.3 Effect of Termination
            </h3>
            <p className="text-gray-600 mb-6">
              Upon termination, your right to access the Service ceases immediately. We will delete or
              anonymise your personal data within 30 days, except where retention is required by law or
              for legitimate business purposes. Existing bookings may still be honoured or cancelled at
              the other party&apos;s discretion. Sections of these Terms that should reasonably survive
              termination (including liability limitations, indemnification, and dispute resolution) will
              remain in effect.
            </p>

            {/* 17. Dispute Resolution and Governing Law */}
            <h2 id="disputes" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              17. Dispute Resolution and Governing Law
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              17.1 Governing Law
            </h3>
            <p className="text-gray-600 mb-6">
              These Terms shall be governed by and construed in accordance with the laws of England and Wales,
              without regard to conflict of law principles.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              17.2 Informal Resolution
            </h3>
            <p className="text-gray-600 mb-6">
              Before initiating formal proceedings, we encourage you to contact us at{' '}
              <a href="mailto:legal@timetide.app" className="text-ocean-600 hover:underline">legal@timetide.app</a>{' '}
              to attempt to resolve disputes informally. We will make good-faith efforts to resolve any
              issues within 30 days.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              17.3 Jurisdiction
            </h3>
            <p className="text-gray-600 mb-6">
              If informal resolution fails, the courts of England and Wales shall have exclusive jurisdiction
              over any disputes arising from these Terms or your use of the Service. If you are a consumer in
              the EU, you may also bring proceedings in the courts of your country of residence.
            </p>

            {/* 18. Force Majeure */}
            <h2 id="force-majeure" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              18. Force Majeure
            </h2>
            <p className="text-gray-600 mb-6">
              We shall not be liable for any failure or delay in performing our obligations under these Terms
              to the extent that such failure or delay results from circumstances beyond our reasonable control,
              including but not limited to: natural disasters, pandemics, acts of government, war, terrorism,
              power failures, internet outages, third-party service failures, cyberattacks, or labour disputes.
              We will make reasonable efforts to mitigate the impact of any such event and resume normal
              operations as soon as practicable.
            </p>

            {/* 19. General Provisions */}
            <h2 id="general" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              19. General Provisions
            </h2>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              19.1 Entire Agreement
            </h3>
            <p className="text-gray-600 mb-6">
              These Terms, together with our Privacy Policy and any plan-specific terms, constitute the entire
              agreement between you and SeekaHost Technologies Ltd. regarding your use of TimeTide. Any prior
              agreements, representations, or understandings are superseded by these Terms.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              19.2 Severability
            </h3>
            <p className="text-gray-600 mb-6">
              If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of
              competent jurisdiction, the remaining provisions shall continue in full force and effect. The
              invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              19.3 Waiver
            </h3>
            <p className="text-gray-600 mb-6">
              Our failure to enforce any right or provision of these Terms shall not constitute a waiver of
              that right or provision. Any waiver must be made in writing and signed by an authorised
              representative to be effective.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              19.4 Assignment
            </h3>
            <p className="text-gray-600 mb-6">
              You may not assign or transfer your rights or obligations under these Terms without our prior
              written consent. We may assign these Terms in connection with a merger, acquisition, or sale
              of assets without your consent, provided the assignee agrees to honour these Terms.
            </p>

            <h3 className="text-xl font-heading font-semibold text-gray-900 mt-8 mb-3">
              19.5 Electronic Communications
            </h3>
            <p className="text-gray-600 mb-6">
              By using TimeTide, you consent to receiving electronic communications from us (including emails,
              in-app notifications, and platform announcements). You agree that all agreements, notices, and
              disclosures provided electronically satisfy any legal requirement that such communications be in writing.
            </p>

            {/* 20. Changes to Terms */}
            <h2 id="changes" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              20. Changes to Terms
            </h2>
            <p className="text-gray-600 mb-6">
              We reserve the right to update these Terms at any time. When we make material changes:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 mb-6">
              <li>We will update the &quot;Last updated&quot; date at the top of this page</li>
              <li>We will notify you via email at least 30 days before material changes take effect</li>
              <li>We may display a prominent notice within the Service</li>
              <li>Where required by law, we will seek your explicit consent</li>
            </ul>
            <p className="text-gray-600 mb-6">
              Your continued use of the Service after the effective date of any changes constitutes acceptance
              of the updated Terms. If you do not agree with the changes, you must stop using the Service and
              may close your account.
            </p>

            {/* 21. Contact Information */}
            <h2 id="contact" className="text-2xl font-heading font-bold text-gray-900 mt-12 mb-4">
              21. Contact Information
            </h2>
            <p className="text-gray-600 mb-4">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <p className="text-gray-700 mb-2"><strong>SeekaHost Technologies Ltd.</strong></p>
              <p className="text-gray-600 mb-1">Company Number: 16026964</p>
              <p className="text-gray-600 mb-1">VAT Number: 485829729</p>
              <p className="text-gray-600 mb-3">United Kingdom</p>
              <div className="border-t border-gray-200 pt-3 space-y-1">
                <p className="text-gray-600">Legal enquiries: <a href="mailto:legal@timetide.app" className="text-ocean-600 hover:underline">legal@timetide.app</a></p>
                <p className="text-gray-600">General support: <a href="mailto:support@timetide.app" className="text-ocean-600 hover:underline">support@timetide.app</a></p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-8 mt-12">
              <p className="text-gray-500 text-sm">
                By using TimeTide, you acknowledge that you have read, understood, and agree to be bound
                by these Terms of Service and our <Link href="/privacy-policy" className="text-ocean-600 hover:underline">Privacy Policy</Link>.
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
