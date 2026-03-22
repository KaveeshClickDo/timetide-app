'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import ProfileCard from '@/components/settings/profile-card'
import TimezoneCard from '@/components/settings/timezone-card'
import CalendarIntegrationCard from '@/components/settings/calendar-integration-card'
import VideoConferencingCard from '@/components/settings/video-conferencing-card'
import BookingLinkCard from '@/components/settings/booking-link-card'

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession()
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    timezone: '',
    timezoneAutoDetect: true,
    bio: '',
  })
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [connectingOutlook, setConnectingOutlook] = useState(false)
  const [connectingZoom, setConnectingZoom] = useState(false)

  // Fetch connected calendars
  const { data: calendarsData, refetch: refetchCalendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: async () => {
      const res = await fetch('/api/calendars')
      if (!res.ok) throw new Error('Failed to fetch calendars')
      return res.json()
    },
    enabled: !!session?.user?.id,
  })

  const calendars = calendarsData?.calendars || []
  const googleCalendar = calendars.find((cal: any) => cal.provider === 'GOOGLE') || null
  const outlookCalendar = calendars.find((cal: any) => cal.provider === 'OUTLOOK') || null

  // Fetch Zoom connection status
  const { data: zoomData, refetch: refetchZoom } = useQuery({
    queryKey: ['zoom-status'],
    queryFn: async () => {
      const res = await fetch('/api/zoom/status')
      if (!res.ok) return { connected: false }
      return res.json()
    },
    enabled: !!session?.user?.id,
  })

  const zoomConnected = zoomData?.connected || false

  // Initialize form from session
  useEffect(() => {
    if (session?.user) {
      setFormData({
        name: session.user.name || '',
        username: session.user.username || '',
        timezone: session.user.timezone || 'UTC',
        timezoneAutoDetect: session.user.timezoneAutoDetect ?? true,
        bio: session.user.bio || '',
      })
    }
  }, [session])

  // Auto-detect timezone
  useEffect(() => {
    if (formData.timezoneAutoDetect) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected && detected !== formData.timezone) {
        setFormData((prev) => ({ ...prev, timezone: detected }))
      }
    }
  }, [formData.timezoneAutoDetect])

  // Check username availability
  useEffect(() => {
    const checkUsername = async () => {
      if (!formData.username || formData.username === session?.user?.username) {
        setUsernameAvailable(null)
        return
      }

      setCheckingUsername(true)
      try {
        const res = await fetch(`/api/users/check-username?username=${formData.username}`)
        const data = await res.json()
        setUsernameAvailable(data.available)
      } catch {
        setUsernameAvailable(null)
      }
      setCheckingUsername(false)
    }

    const timer = setTimeout(checkUsername, 500)
    return () => clearTimeout(timer)
  }, [formData.username, session?.user?.username])

  // Save profile mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: (data) => {
      updateSession({ ...session, user: data.user })
      toast({
        title: 'Settings saved',
        description: 'Your profile has been updated.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save',
        variant: 'destructive',
      })
    },
  })

  // Avatar upload mutation
  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/users/me/avatar', {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to upload')
      }
      return res.json()
    },
    onSuccess: (data) => {
      updateSession({ ...session, user: data.user })
      toast({
        title: 'Photo updated',
        description: 'Your profile photo has been changed.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload photo',
        variant: 'destructive',
      })
    },
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 2MB.',
        variant: 'destructive',
      })
      return
    }
    avatarMutation.mutate(file)
    e.target.value = ''
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (usernameAvailable === false) {
      toast({
        title: 'Username unavailable',
        description: 'Please choose a different username.',
        variant: 'destructive',
      })
      return
    }
    saveMutation.mutate(formData)
  }

  // Calendar connection handlers
  const handleConnectGoogle = async () => {
    try {
      setConnectingGoogle(true)
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'GOOGLE' }),
      })
      if (!res.ok) throw new Error('Failed to get auth URL')
      const data = await res.json()
      if (data.authUrl) window.location.href = data.authUrl
    } catch {
      toast({
        title: 'Connection failed',
        description: 'Failed to connect Google Calendar. Please try again.',
        variant: 'destructive',
      })
      setConnectingGoogle(false)
    }
  }

  const handleConnectOutlook = async () => {
    try {
      setConnectingOutlook(true)
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'OUTLOOK' }),
      })
      if (!res.ok) throw new Error('Failed to get auth URL')
      const data = await res.json()
      if (data.authUrl) window.location.href = data.authUrl
    } catch {
      toast({
        title: 'Connection failed',
        description: 'Failed to connect Outlook Calendar. Please try again.',
        variant: 'destructive',
      })
      setConnectingOutlook(false)
    }
  }

  const disconnectCalendarMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      const res = await fetch(`/api/calendars/${calendarId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      return res.json()
    },
    onSuccess: () => {
      refetchCalendars()
      toast({ title: 'Calendar disconnected', description: 'Your calendar has been disconnected.' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to disconnect calendar.', variant: 'destructive' })
    },
  })

  const handleConnectZoom = async () => {
    try {
      setConnectingZoom(true)
      window.location.href = '/api/zoom/connect'
    } catch {
      toast({
        title: 'Connection failed',
        description: 'Failed to connect Zoom. Please try again.',
        variant: 'destructive',
      })
      setConnectingZoom(false)
    }
  }

  const disconnectZoomMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/zoom/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect')
      return res.json()
    },
    onSuccess: () => {
      refetchZoom()
      toast({ title: 'Zoom disconnected', description: 'Your Zoom account has been disconnected.' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to disconnect Zoom.', variant: 'destructive' })
    },
  })

  // OAuth callback handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const calendarConnected = params.get('calendar_connected')
    const calendarError = params.get('calendar_error')
    const zoomConnectedParam = params.get('zoom_connected')
    const error = params.get('error')

    if (calendarConnected === 'true') {
      toast({ title: 'Calendar connected!', description: 'Your Google Calendar has been successfully connected.' })
      refetchCalendars()
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (calendarError) {
      toast({ title: 'Connection failed', description: `Failed to connect calendar: ${calendarError}`, variant: 'destructive' })
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (zoomConnectedParam === 'true') {
      toast({ title: 'Zoom connected!', description: 'Your Zoom account has been successfully connected.' })
      refetchZoom()
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (error) {
      toast({ title: 'Connection failed', description: `Failed to connect: ${error}`, variant: 'destructive' })
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-2">
          Settings
        </h1>
        <p className="text-sm sm:text-base text-gray-600">Manage your account and preferences.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ProfileCard
          userImage={session?.user?.image}
          userName={session?.user?.name}
          formData={formData}
          setFormData={setFormData}
          usernameAvailable={usernameAvailable}
          checkingUsername={checkingUsername}
          avatarUploading={avatarMutation.isPending}
          onAvatarChange={handleAvatarChange}
        />

        <TimezoneCard
          timezone={formData.timezone}
          timezoneAutoDetect={formData.timezoneAutoDetect}
          setFormData={setFormData}
        />

        <CalendarIntegrationCard
          googleCalendar={googleCalendar}
          outlookCalendar={outlookCalendar}
          connectingGoogle={connectingGoogle}
          connectingOutlook={connectingOutlook}
          disconnecting={disconnectCalendarMutation.isPending}
          onConnectGoogle={handleConnectGoogle}
          onConnectOutlook={handleConnectOutlook}
          onDisconnect={(id) => disconnectCalendarMutation.mutate(id)}
        />

        <VideoConferencingCard
          zoomConnected={zoomConnected}
          googleCalendarConnected={!!googleCalendar}
          outlookCalendarConnected={!!outlookCalendar}
          outlookTeamsCapable={outlookCalendar?.teamsCapable ?? false}
          connectingZoom={connectingZoom}
          disconnectingZoom={disconnectZoomMutation.isPending}
          onConnectZoom={handleConnectZoom}
          onDisconnectZoom={() => disconnectZoomMutation.mutate()}
        />

        <BookingLinkCard username={formData.username} />

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
