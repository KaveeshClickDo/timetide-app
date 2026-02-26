import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { ServiceWorkerRegister } from '@/components/service-worker-register'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
})

export const metadata: Metadata = {
  title: {
    default: 'TimeTide - Scheduling That Flows With Your Time',
    template: '%s | TimeTide',
  },
  description:
    'Modern scheduling platform that flows with your time. Create booking pages, sync calendars, and let clients schedule meetings effortlessly.',
  keywords: [
    'scheduling',
    'calendar',
    'booking',
    'appointments',
    'meetings',
    'time management',
  ],
  authors: [{ name: 'TimeTide' }],
  creator: 'TimeTide',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://timetide.app',
    title: 'TimeTide - Scheduling That Flows With Your Time',
    description:
      'Modern scheduling platform that flows with your time. Create booking pages, sync calendars, and let clients schedule meetings effortlessly.',
    siteName: 'TimeTide',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TimeTide - Scheduling That Flows With Your Time',
    description:
      'Modern scheduling platform that flows with your time. Create booking pages, sync calendars, and let clients schedule meetings effortlessly.',
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  themeColor: '#0ea5e9',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TimeTide',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${inter.variable} ${plusJakarta.variable} font-sans antialiased`}>
        <Providers>
          <ServiceWorkerRegister />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
