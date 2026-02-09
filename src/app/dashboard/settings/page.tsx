'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import {
  User,
  Globe,
  Link as LinkIcon,
  Calendar,
  Save,
  Loader2,
  Check,
  AlertCircle,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
import { getInitials } from '@/lib/utils'
import { TIMEZONES } from '@/lib/constants'

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession()
  const { toast } = useToast()
  const queryClient = useQueryClient()

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
  const googleCalendar = calendars.find((cal: any) => cal.provider === 'GOOGLE')
  const outlookCalendar = calendars.find((cal: any) => cal.provider === 'OUTLOOK')

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

  // Auto-detect timezone when auto-detect is enabled
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

  // Handle Google Calendar connection
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
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Error connecting Google Calendar:', error)
      toast({
        title: 'Connection failed',
        description: 'Failed to connect Google Calendar. Please try again.',
        variant: 'destructive',
      })
      setConnectingGoogle(false)
    }
  }

  // Handle Outlook Calendar connection
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
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Error connecting Outlook Calendar:', error)
      toast({
        title: 'Connection failed',
        description: 'Failed to connect Outlook Calendar. Please try again.',
        variant: 'destructive',
      })
      setConnectingOutlook(false)
    }
  }

  // Handle calendar disconnection
  const disconnectCalendarMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      const res = await fetch(`/api/calendars/${calendarId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to disconnect')
      return res.json()
    },
    onSuccess: () => {
      refetchCalendars()
      toast({
        title: 'Calendar disconnected',
        description: 'Your calendar has been disconnected.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to disconnect calendar.',
        variant: 'destructive',
      })
    },
  })

  // Handle Zoom connection
  const handleConnectZoom = async () => {
    try {
      setConnectingZoom(true)
      window.location.href = '/api/zoom/connect'
    } catch (error) {
      console.error('Error connecting Zoom:', error)
      toast({
        title: 'Connection failed',
        description: 'Failed to connect Zoom. Please try again.',
        variant: 'destructive',
      })
      setConnectingZoom(false)
    }
  }

  // Handle Zoom disconnection
  const disconnectZoomMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/zoom/disconnect', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to disconnect')
      return res.json()
    },
    onSuccess: () => {
      refetchZoom()
      toast({
        title: 'Zoom disconnected',
        description: 'Your Zoom account has been disconnected.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to disconnect Zoom.',
        variant: 'destructive',
      })
    },
  })

  // Check for OAuth callback success/error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const calendarConnected = params.get('calendar_connected')
    const calendarError = params.get('calendar_error')
    const zoomConnected = params.get('zoom_connected')
    const error = params.get('error')

    if (calendarConnected === 'true') {
      toast({
        title: 'Calendar connected!',
        description: 'Your Google Calendar has been successfully connected.',
      })
      refetchCalendars()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (calendarError) {
      toast({
        title: 'Connection failed',
        description: `Failed to connect calendar: ${calendarError}`,
        variant: 'destructive',
      })
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (zoomConnected === 'true') {
      toast({
        title: 'Zoom connected!',
        description: 'Your Zoom account has been successfully connected.',
      })
      refetchZoom()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (error) {
      toast({
        title: 'Connection failed',
        description: `Failed to connect: ${error}`,
        variant: 'destructive',
      })
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
          Settings
        </h1>
        <p className="text-gray-600">Manage your account and preferences.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription>
              Your public profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={session?.user?.image || undefined} />
                <AvatarFallback className="text-xl">
                  {session?.user?.name ? getInitials(session.user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm text-gray-500">
                  Profile photo is managed through your connected account.
                </p>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your name"
              />
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  timetide.app/
                </span>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    })
                  }
                  className="pl-28"
                  placeholder="username"
                />
                {checkingUsername && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
                {!checkingUsername && usernameAvailable === true && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
                {!checkingUsername && usernameAvailable === false && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                )}
              </div>
              {usernameAvailable === false && (
                <p className="text-sm text-red-500">This username is already taken</p>
              )}
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
                placeholder="A short description about yourself..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Timezone Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Timezone
            </CardTitle>
            <CardDescription>
              Your timezone is used for displaying availability.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Auto-detect checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.timezoneAutoDetect}
                onChange={(e) => {
                  const autoDetect = e.target.checked
                  setFormData((prev) => {
                    const updated = { ...prev, timezoneAutoDetect: autoDetect }
                    if (autoDetect) {
                      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
                      if (detected) updated.timezone = detected
                    }
                    return updated
                  })
                }}
                className="h-4 w-4 rounded border-gray-300 text-ocean-600 focus:ring-ocean-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Automatically detect timezone
              </span>
            </label>

            {formData.timezoneAutoDetect ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-ocean-50 border border-ocean-200 rounded-lg">
                <Globe className="h-4 w-4 text-ocean-600" />
                <span className="text-sm text-ocean-700 font-medium">
                  {formData.timezone}
                </span>
                <span className="text-xs text-ocean-500">
                  ({TIMEZONES.find((tz) => tz.value === formData.timezone)?.label || formData.timezone})
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connected Calendars */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Connected Calendars
            </CardTitle>
            <CardDescription>
              Connect your calendars to check for conflicts automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Google Calendar */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium">Google Calendar</p>
                    <p className="text-sm text-gray-500">
                      {googleCalendar ? (
                        <>
                          <Check className="inline h-3 w-3 mr-1 text-green-500" />
                          {googleCalendar.name}
                        </>
                      ) : (
                        'Not connected'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {googleCalendar ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleConnectGoogle}
                        disabled={connectingGoogle}
                      >
                        {connectingGoogle ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          'Reconnect'
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectCalendarMutation.mutate(googleCalendar.id)}
                        disabled={disconnectCalendarMutation.isPending}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleConnectGoogle}
                      disabled={connectingGoogle}
                    >
                      {connectingGoogle ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Microsoft Outlook */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Microsoft Outlook</p>
                    <p className="text-sm text-gray-500">
                      {outlookCalendar ? (
                        <>
                          <Check className="inline h-3 w-3 mr-1 text-green-500" />
                          {outlookCalendar.name}
                        </>
                      ) : (
                        'Not connected'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {outlookCalendar ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleConnectOutlook}
                        disabled={connectingOutlook}
                      >
                        {connectingOutlook ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          'Reconnect'
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectCalendarMutation.mutate(outlookCalendar.id)}
                        disabled={disconnectCalendarMutation.isPending}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleConnectOutlook}
                      disabled={connectingOutlook}
                    >
                      {connectingOutlook ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Video Conferencing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Video Conferencing
            </CardTitle>
            <CardDescription>
              Connect video conferencing apps to auto-generate meeting links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Zoom */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Video className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Zoom</p>
                    <p className="text-sm text-gray-500">
                      {zoomConnected ? (
                        <>
                          <Check className="inline h-3 w-3 mr-1 text-green-500" />
                          Connected
                        </>
                      ) : (
                        'Auto-generate Zoom meeting links'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {zoomConnected ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => disconnectZoomMutation.mutate()}
                      disabled={disconnectZoomMutation.isPending}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleConnectZoom}
                      disabled={connectingZoom}
                    >
                      {connectingZoom ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Google Meet - Already handled by Google Calendar */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Video className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">Google Meet</p>
                    <p className="text-sm text-gray-500">
                      {googleCalendar ? (
                        <>
                          <Check className="inline h-3 w-3 mr-1 text-green-500" />
                          Auto-enabled via Google Calendar
                        </>
                      ) : (
                        'Connect Google Calendar to enable'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Microsoft Teams - Handled by Outlook Calendar */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Video className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Microsoft Teams</p>
                    <p className="text-sm text-gray-500">
                      {outlookCalendar ? (
                        <>
                          <Check className="inline h-3 w-3 mr-1 text-green-500" />
                          Auto-enabled via Outlook Calendar
                        </>
                      ) : (
                        'Connect Outlook Calendar to enable'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Booking Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Booking Link
            </CardTitle>
            <CardDescription>Share this link to let others book time with you.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/${formData.username}`}
                className="bg-gray-50"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/${formData.username}`
                  )
                  toast({ title: 'Link copied!' })
                }}
              >
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>

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
