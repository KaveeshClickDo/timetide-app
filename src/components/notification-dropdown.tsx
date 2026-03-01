'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Users,
  Mail,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  type Notification,
} from '@/hooks/use-notifications'

const typeIcons: Record<string, typeof Calendar> = {
  BOOKING_CREATED: Calendar,
  BOOKING_CONFIRMED: CheckCircle2,
  BOOKING_REJECTED: XCircle,
  BOOKING_CANCELLED: XCircle,
  BOOKING_RESCHEDULED: RefreshCw,
  BOOKING_REMINDER: Clock,
  TEAM_MEMBER_ADDED: Users,
  TEAM_INVITATION_RECEIVED: Mail,
}

const typeColors: Record<string, string> = {
  BOOKING_CREATED: 'text-ocean-600 bg-ocean-50',
  BOOKING_CONFIRMED: 'text-green-600 bg-green-50',
  BOOKING_REJECTED: 'text-red-600 bg-red-50',
  BOOKING_CANCELLED: 'text-red-600 bg-red-50',
  BOOKING_RESCHEDULED: 'text-yellow-600 bg-yellow-50',
  BOOKING_REMINDER: 'text-blue-600 bg-blue-50',
  TEAM_MEMBER_ADDED: 'text-purple-600 bg-purple-50',
  TEAM_INVITATION_RECEIVED: 'text-indigo-600 bg-indigo-50',
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { data, isLoading } = useNotifications()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markAsRead.mutate(notification.id)
    }
    setOpen(false)
    if (notification.bookingId) {
      router.push(`/dashboard/bookings/${notification.bookingId}`)
    }
  }

  function handleMarkAllRead() {
    markAllAsRead.mutate()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-2 hover:bg-gray-100 rounded-lg relative" aria-label="Notifications">
          <Bell className="h-5 w-5 text-gray-500" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ocean-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-2rem)] sm:w-96 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-ocean-600 hover:text-ocean-700 h-auto py-1 px-2 shrink-0"
              onClick={handleMarkAllRead}
            >
              Mark all as read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-[min(400px,60vh)]">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              <Bell className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => {
                const Icon = typeIcons[notification.type] ?? Bell
                const colorClass =
                  typeColors[notification.type] ?? 'text-gray-600 bg-gray-50'

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b last:border-b-0',
                      !notification.read && 'bg-ocean-50/30'
                    )}
                  >
                    <div
                      className={cn(
                        'rounded-full p-2 mt-0.5 shrink-0',
                        colorClass
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            'text-sm',
                            !notification.read
                              ? 'font-semibold text-gray-900'
                              : 'font-medium text-gray-700'
                          )}
                        >
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-ocean-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 break-words">
                        {notification.message}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
