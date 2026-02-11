'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  read: boolean
  bookingId: string | null
  createdAt: string
}

interface NotificationsResponse {
  notifications: Notification[]
  unreadCount: number
  nextCursor: string | null
}

export function useNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=20')
      if (!res.ok) throw new Error('Failed to fetch notifications')
      return res.json()
    },
    refetchInterval: 30_000,
  })
}

export function useUnreadCount() {
  const { data } = useNotifications()
  return data?.unreadCount ?? 0
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error('Failed to mark as read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error('Failed to mark all as read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
