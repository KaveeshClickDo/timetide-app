'use client'

import { useState } from 'react'
import { Check, Calendar, Video, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

const PROVIDER_CONFIG = {
  GOOGLE: {
    label: 'Google Calendar',
    sublabel: 'Also enables Google Meet links',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    Icon: Calendar,
  },
  OUTLOOK: {
    label: 'Microsoft Outlook',
    sublabel: 'Also enables Microsoft Teams links',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    Icon: Calendar,
  },
  ZOOM: {
    label: 'Zoom',
    sublabel: 'Auto-generate Zoom meeting links',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    Icon: Video,
  },
} as const

interface IntegrationConnectCardProps {
  provider: keyof typeof PROVIDER_CONFIG
  connected: boolean
  name?: string
  returnTo?: string
}

export function IntegrationConnectCard({ provider, connected, name, returnTo }: IntegrationConnectCardProps) {
  const { toast } = useToast()
  const [connecting, setConnecting] = useState(false)
  const config = PROVIDER_CONFIG[provider]
  const Icon = config.Icon

  const handleConnect = async () => {
    try {
      setConnecting(true)
      if (provider === 'ZOOM') {
        const url = returnTo
          ? `/api/zoom/connect?returnTo=${encodeURIComponent(returnTo)}`
          : '/api/zoom/connect'
        window.location.href = url
      } else {
        const res = await fetch('/api/calendars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, returnTo }),
        })
        if (!res.ok) throw new Error('Failed to get auth URL')
        const data = await res.json()
        if (data.authUrl) {
          window.location.href = data.authUrl
        }
      }
    } catch {
      toast({
        title: 'Connection failed',
        description: `Failed to connect ${config.label}. Please try again.`,
        variant: 'destructive',
      })
      setConnecting(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 p-4 border rounded-lg">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`w-10 h-10 flex-shrink-0 rounded-lg ${config.iconBg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{config.label}</p>
          <p className="text-sm text-gray-500">
            {connected ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" />
                {name || 'Connected'}
              </span>
            ) : (
              config.sublabel
            )}
          </p>
        </div>
      </div>
      {connected ? (
        <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
          <Check className="h-3 w-3" />
          Connected
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleConnect}
          disabled={connecting}
          className="flex-shrink-0"
        >
          {connecting ? (
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
  )
}
