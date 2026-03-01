import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export default function PublicNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-ocean-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/">
              <Image src="/header-logo.svg" alt="TimeTide" width={150} height={40} priority />
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-gray-600 hover:text-ocean-600 transition-colors">
              Features
            </Link>
            <Link href="/#how-it-works" className="text-gray-600 hover:text-ocean-600 transition-colors">
              How It Works
            </Link>
            <Link href="/#pricing" className="text-gray-600 hover:text-ocean-600 transition-colors">
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
  )
}
