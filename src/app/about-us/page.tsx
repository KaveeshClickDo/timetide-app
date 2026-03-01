import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  Users,
  Globe,
  Heart,
  Target,
  Zap,
  ArrowRight,
  Building2,
  Mail,
} from 'lucide-react'
import PublicNavbar from '@/components/public-navbar'
import PublicFooter from '@/components/public-footer'

export const metadata = {
  title: 'About Us - TimeTide',
  description: 'Learn about TimeTide, the modern scheduling platform that flows with your time. Built by SeekaHost Technologies Ltd.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 ocean-bg-animated opacity-30" />
        <div className="absolute bottom-0 left-0 right-0 h-32 wave-divider" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl font-heading font-bold text-gray-900 mb-6 leading-tight">
              About
              <span className="text-gradient-ocean block">TimeTide</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              We&apos;re on a mission to make scheduling effortless for everyone.
              No more back-and-forth emails, no more timezone confusion - just seamless booking.
            </p>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-heading font-bold text-gray-900 mb-6">
                Our Story
              </h2>
              <div className="space-y-4 text-gray-600">
                <p>
                  TimeTide was born from a simple frustration: scheduling meetings shouldn&apos;t be
                  harder than the meetings themselves. We spent countless hours going back and forth
                  over email, juggling timezones, and missing opportunities because of scheduling friction.
                </p>
                <p>
                  Built by <strong>SeekaHost Technologies Ltd.</strong>, a UK-based technology company,
                  TimeTide represents our commitment to creating tools that respect people&apos;s time.
                  We believe that modern professionals deserve scheduling solutions that are as fluid
                  and adaptable as their work lives.
                </p>
                <p>
                  Our oceanic theme isn&apos;t just aesthetic - it reflects our philosophy. Like the tide,
                  your schedule should flow naturally, adapting to the rhythms of your day while
                  maintaining the reliability you need.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-ocean-gradient rounded-2xl blur-3xl opacity-20 transform scale-105" />
              <div className="relative bg-white rounded-2xl shadow-2xl shadow-ocean-500/20 border border-ocean-100 p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-ocean-gradient flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-gray-900">SeekaHost Technologies Ltd.</h3>
                    <p className="text-sm text-gray-500">UK Registered Company</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm text-gray-600">
                  <p><strong>Company Number:</strong> 16026964</p>
                  <p><strong>VAT Number:</strong> 485829729</p>
                  <p><strong>Headquarters:</strong> United Kingdom</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Values Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-gray-900 mb-4">
              Our Mission & Values
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              What drives us every day to build better scheduling experiences.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Target,
                title: 'Our Mission',
                description:
                  'To eliminate scheduling friction and give people back their most valuable resource: time.',
              },
              {
                icon: Heart,
                title: 'User-Centric',
                description:
                  'Every feature we build starts with one question: how does this make our users\' lives easier?',
              },
              {
                icon: Globe,
                title: 'Global Accessibility',
                description:
                  'Scheduling should work seamlessly across timezones, languages, and borders.',
              },
              {
                icon: Zap,
                title: 'Simplicity',
                description:
                  'Powerful features don\'t have to be complicated. We strive for elegance in everything we build.',
              },
              {
                icon: Users,
                title: 'Community',
                description:
                  'We\'re building more than software - we\'re building a community of time-conscious professionals.',
              },
              {
                icon: Calendar,
                title: 'Reliability',
                description:
                  'Your schedule is critical. We\'re committed to 99.9% uptime and rock-solid performance.',
              },
            ].map((value) => (
              <div
                key={value.title}
                className="card-ocean p-6 group"
              >
                <div className="w-12 h-12 rounded-xl bg-ocean-gradient flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <value.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                  {value.title}
                </h3>
                <p className="text-gray-600">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Offer Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-gray-900 mb-4">
              What We Offer
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A comprehensive scheduling platform designed for modern professionals and teams.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-ocean-100">
              <h3 className="text-2xl font-heading font-semibold text-gray-900 mb-4">
                For Individuals
              </h3>
              <ul className="space-y-3">
                {[
                  'Personal booking pages',
                  'Calendar integrations (Google, Outlook)',
                  'Automatic timezone handling',
                  'Email notifications & reminders',
                  'Custom meeting types',
                  'Buffer time management',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-gray-600">
                    <div className="w-2 h-2 rounded-full bg-ocean-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-ocean-100">
              <h3 className="text-2xl font-heading font-semibold text-gray-900 mb-4">
                For Teams
              </h3>
              <ul className="space-y-3">
                {[
                  'Team scheduling pages',
                  'Round-robin assignment',
                  'Collective availability',
                  'Booking analytics & insights',
                  'Role-based permissions',
                  'Zoom & video integrations',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-gray-600">
                    <div className="w-2 h-2 rounded-full bg-ocean-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-ocean-gradient flex items-center justify-center mx-auto mb-6">
            <Mail className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-4xl font-heading font-bold text-gray-900 mb-4">
            Get in Touch
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Have questions? We&apos;d love to hear from you. Reach out to our team
            and we&apos;ll get back to you as soon as possible.
          </p>
          <Link href="/contact-us">
            <Button size="lg">
              Contact Us
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-ocean-gradient">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-heading font-bold text-white mb-6">
            Ready to Transform Your Scheduling?
          </h2>
          <p className="text-xl text-ocean-100 mb-10">
            Join thousands of professionals who trust TimeTide to manage their time.
          </p>
          <Link href="/auth/signup">
            <Button
              size="lg"
              className="bg-white text-ocean-600 hover:bg-ocean-50 shadow-xl"
            >
              Start for Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
