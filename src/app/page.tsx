import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  Clock,
  Globe,
  Users,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { PRICING_TIERS } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import PublicNavbar from '@/components/public-navbar'
import PublicFooter from '@/components/public-footer'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'TimeTide',
      url: 'https://timetide.app',
      logo: 'https://timetide.app/logo.svg',
      description:
        'Modern scheduling platform that flows with your time. Create booking pages, sync calendars, and let clients schedule meetings effortlessly.',
      foundingDate: '2024',
      sameAs: [],
    },
    {
      '@type': 'WebSite',
      name: 'TimeTide',
      url: 'https://timetide.app',
      description:
        'Modern scheduling platform that flows with your time.',
      publisher: { '@type': 'Organization', name: 'TimeTide' },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'TimeTide',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://timetide.app',
      description:
        'Create booking pages, sync calendars, and let clients schedule meetings effortlessly.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'GBP',
        description: 'Free plan available',
      },
    },
  ],
}

export default async function HomePage() {
  // Redirect logged-in users to dashboard
  const session = await getServerSession(authOptions)
  if (session) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 ocean-bg-animated opacity-30" />
        <div className="absolute bottom-0 left-0 right-0 h-32 wave-divider" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ocean-100 text-ocean-700 text-sm font-medium mb-8">
              <Zap className="h-4 w-4" />
              Scheduling that flows with your time
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-heading font-bold text-gray-900 mb-6 leading-tight">
              Let Your Schedule
              <span className="text-gradient-ocean block">Flow Effortlessly</span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              Create beautiful booking pages, sync with your calendars, and let clients
              schedule meetings on your terms. Modern scheduling for modern professionals.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup">
                <Button size="lg" className="w-full sm:w-auto">
                  Start for Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  See How It Works
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-500">
              No credit card required · Free forever for individuals
            </p>
          </div>

          {/* Hero Image/Preview */}
          <div className="mt-16 relative">
            <div className="relative mx-auto max-w-5xl">
              <div className="absolute inset-0 bg-ocean-gradient rounded-2xl blur-3xl opacity-20 transform scale-105" />
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-ocean-500/20 border border-ocean-100 overflow-hidden">
                {/* Mock Calendar UI */}
                <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-lg font-heading font-semibold text-gray-900">
                        30 Minute Meeting
                      </h3>
                      <p className="text-gray-500">with Sarah Johnson</p>
                    </div>
                    <div className="flex items-center gap-2 text-ocean-600">
                      <Clock className="h-5 w-5" />
                      <span>30 min</span>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Calendar */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-medium">January 2025</span>
                        <div className="flex gap-2">
                          <button className="p-1 hover:bg-gray-200 rounded">←</button>
                          <button className="p-1 hover:bg-gray-200 rounded">→</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-sm">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                          <div key={day} className="text-gray-400 py-2">
                            {day}
                          </div>
                        ))}
                        {Array.from({ length: 31 }, (_, i) => (
                          <div
                            key={i}
                            className={`py-2 rounded-full ${
                              i === 14
                                ? 'bg-ocean-500 text-white'
                                : i === 15 || i === 16 || i === 17
                                ? 'font-semibold text-ocean-700 hover:bg-ocean-100 cursor-pointer'
                                : 'text-gray-400'
                            }`}
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Time Slots */}
                    <div>
                      <p className="text-sm text-gray-500 mb-4">
                        Wednesday, January 15
                      </p>
                      <div className="space-y-2">
                        {['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '2:00 PM', '2:30 PM'].map(
                          (time, i) => (
                            <button
                              key={time}
                              className={`w-full time-slot ${
                                i === 2 ? 'time-slot-selected' : ''
                              }`}
                            >
                              {time}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-gray-900 mb-4">
              Everything You Need to Schedule Smarter
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed to save you time and impress your clients.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Calendar,
                title: 'Calendar Sync',
                description:
                  'Connect Google Calendar, Outlook, and more. Automatically block busy times.',
              },
              {
                icon: Globe,
                title: 'Timezone Smart',
                description:
                  'Automatic timezone detection ensures everyone sees the right time.',
              },
              {
                icon: Users,
                title: 'Team Scheduling',
                description:
                  'Round-robin and collective booking for teams. Perfect for sales and support.',
              },
              {
                icon: Zap,
                title: 'Instant Booking',
                description:
                  'No back-and-forth. Clients pick a time that works and book instantly.',
              },
              {
                icon: Shield,
                title: 'Buffer Times',
                description:
                  'Prevent back-to-back meetings with customizable buffer periods.',
              },
              {
                icon: Clock,
                title: 'Flexible Availability',
                description:
                  'Set different hours for different days. Add date-specific overrides.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="card-ocean p-6 group"
              >
                <div className="w-12 h-12 rounded-xl bg-ocean-gradient flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-gray-900 mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Three simple steps to streamlined scheduling.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Create Your Page',
                description:
                  'Set up your booking page with your availability, meeting types, and branding.',
              },
              {
                step: '02',
                title: 'Share Your Link',
                description:
                  'Send your unique TimeTide link to clients via email, website, or social media.',
              },
              {
                step: '03',
                title: 'Get Booked',
                description:
                  'Clients pick a time, fill in details, and meetings appear on your calendar.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ocean-100 text-ocean-600 text-2xl font-heading font-bold mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start free, upgrade when you need more.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  'card-ocean p-8',
                  tier.isPopular && 'border-2 border-ocean-500 relative'
                )}
              >
                {tier.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-ocean-500 text-white text-sm font-medium rounded-full">
                    Popular
                  </div>
                )}
                <h3 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                  {tier.name}
                </h3>
                <p className="text-gray-600 mb-6">{tier.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-heading font-bold">{tier.priceLabel}</span>
                  <span className="text-gray-500">{tier.priceSuffix}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-ocean-500" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup">
                  <Button variant={tier.ctaVariant} className="w-full">
                    {tier.ctaLabel}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-ocean-gradient">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-heading font-bold text-white mb-6">
            Ready to Let Your Schedule Flow?
          </h2>
          <p className="text-xl text-ocean-100 mb-10">
            Join thousands of professionals who save hours every week with TimeTide.
          </p>
          <Link href="/auth/signup">
            <Button
              size="lg"
              className="bg-white text-ocean-600 hover:bg-ocean-50 shadow-xl"
            >
              Start Scheduling for Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
