'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  ArrowRight,
  Mail,
  Shield,
  Scale,
  Loader2,
  CheckCircle2,
  Send,
} from 'lucide-react'

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message')
      }

      setStatus('success')
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

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

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 ocean-bg-animated opacity-30" />
        <div className="absolute bottom-0 left-0 right-0 h-32 wave-divider" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl font-heading font-bold text-gray-900 mb-6 leading-tight">
              Get in
              <span className="text-gradient-ocean block">Touch</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Have a question, feedback, or need help? We&apos;d love to hear from you.
              Our team typically responds within 24 hours.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form + Info Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Contact Form */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-lg border border-ocean-100 p-8">
                <h2 className="text-2xl font-heading font-bold text-gray-900 mb-6">
                  Send Us a Message
                </h2>

                {status === 'success' ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                      Message Sent!
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Thank you for reaching out. We&apos;ll get back to you as soon as possible.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setStatus('idle')}
                    >
                      Send Another Message
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          placeholder="John Doe"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        placeholder="How can we help?"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us more about your question or feedback..."
                        className="min-h-[160px]"
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        required
                        minLength={10}
                      />
                    </div>

                    {status === 'error' && (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                        {errorMessage}
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full sm:w-auto"
                      disabled={status === 'loading'}
                    >
                      {status === 'loading' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="card-ocean p-6">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-ocean-gradient flex items-center justify-center flex-shrink-0">
                    <Mail className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-gray-900">General Enquiries</h3>
                    <a href="mailto:hello@timetide.app" className="text-sm text-ocean-600 hover:underline">
                      hello@timetide.app
                    </a>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  For questions about our product, pricing, or anything else.
                </p>
              </div>

              <div className="card-ocean p-6">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-ocean-gradient flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-gray-900">Privacy & Security</h3>
                    <a href="mailto:privacy@timetide.app" className="text-sm text-ocean-600 hover:underline">
                      privacy@timetide.app
                    </a>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  For data privacy requests, security concerns, or vulnerability reports.
                </p>
              </div>

              <div className="card-ocean p-6">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-ocean-gradient flex items-center justify-center flex-shrink-0">
                    <Scale className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-gray-900">Legal</h3>
                    <a href="mailto:legal@timetide.app" className="text-sm text-ocean-600 hover:underline">
                      legal@timetide.app
                    </a>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  For legal enquiries, terms of service, or partnership agreements.
                </p>
              </div>

              <div className="bg-ocean-50 rounded-2xl border border-ocean-100 p-6">
                <h3 className="font-heading font-semibold text-gray-900 mb-2">
                  Response Times
                </h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    General enquiries: within 24 hours
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-ocean-500" />
                    Technical support: within 12 hours
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    Security issues: within 4 hours
                  </li>
                </ul>
              </div>
            </div>
          </div>
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
            &copy; {new Date().getFullYear()} TimeTide by SeekaHost Technologies Ltd. All Rights Reserved.
            <br />
            Company Number: 16026964. VAT Number: 485829729.
          </div>
        </div>
      </footer>
    </div>
  )
}
