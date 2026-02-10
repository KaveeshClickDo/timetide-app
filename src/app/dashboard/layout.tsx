'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  Calendar,
  Clock,
  Settings,
  Users,
  BarChart3,
  Link as LinkIcon,
  Webhook,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Plus,
  Bell,
  CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn, getInitials } from '@/lib/utils'
import { getPlanBadgeStyles, PLAN_LIMITS, type PlanTier } from '@/lib/pricing'

const navigation: { name: string; href: string; icon: typeof Calendar; requiredPlan?: PlanTier }[] = [
  { name: 'Bookings', href: '/dashboard', icon: Calendar },
  { name: 'Event Types', href: '/dashboard/event-types', icon: LinkIcon },
  { name: 'Availability', href: '/dashboard/availability', icon: Clock },
  { name: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook, requiredPlan: 'PRO' },
  { name: 'Teams', href: '/dashboard/teams', icon: Users, requiredPlan: 'TEAM' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, requiredPlan: 'TEAM' },
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, update: updateSession } = useSession()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const user = session?.user

  // Auto-update timezone if auto-detect is enabled and browser timezone differs
  useEffect(() => {
    if (!user || !user.timezoneAutoDetect) return

    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detected && detected !== user.timezone) {
      fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: detected }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json()
            updateSession({ ...session, user: data.user })
          }
        })
        .catch(() => {
          // Silently fail - not critical
        })
    }
  }, [user?.timezone, user?.timezoneAutoDetect])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <Link href="/dashboard" className="flex items-center">
              <Image
                src="/header-logo.svg"
                alt="TimeTide"
                width={140}
                height={36}
                priority
              />
            </Link>
            <button
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href)
              const userPlan = (user?.plan as PlanTier) || 'FREE'
              const tierOrder: PlanTier[] = ['FREE', 'PRO', 'TEAM']
              const isLocked = item.requiredPlan && tierOrder.indexOf(userPlan) < tierOrder.indexOf(item.requiredPlan)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-ocean-50 text-ocean-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                  {isLocked && (
                    <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      {item.requiredPlan}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-3 border-t border-gray-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.image || undefined} />
                    <AvatarFallback>
                      {user?.name ? getInitials(user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.name || 'User'}
                      </p>
                      <Badge className={cn('text-[10px] px-1.5 py-0', getPlanBadgeStyles((user?.plan as PlanTier) || 'FREE'))}>
                        {user?.plan || 'FREE'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/billing">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Billing & Plans
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/${user?.username || ''}`} target="_blank">
                    <LinkIcon className="mr-2 h-4 w-4" />
                    View Public Page
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6">
            <button
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1 lg:flex-none" />

            <div className="flex items-center gap-3">
              {/* Quick actions */}
              <Link href="/dashboard/event-types/new">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New Event Type
                </Button>
              </Link>

              {/* Notifications */}
              <button className="p-2 hover:bg-gray-100 rounded-lg relative">
                <Bell className="h-5 w-5 text-gray-500" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-ocean-500 rounded-full" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>

        {/* Footer */}
        <footer className="mt-auto border-t border-gray-200 bg-white px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
            <p>
              © {new Date().getFullYear()} TimeTide by SeekaHost Technologies Ltd. All Rights Reserved.
            </p>
            <div className="flex items-center gap-4">
              <p>Company Number: 16026964. VAT Number: 485829729.</p>
              <span className="text-gray-400">v1.0.0</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
