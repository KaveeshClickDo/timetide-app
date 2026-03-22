'use client'

import {
  Video,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface VideoConferencingCardProps {
  zoomConnected: boolean
  googleCalendarConnected: boolean
  outlookCalendarConnected: boolean
  outlookTeamsCapable: boolean
  connectingZoom: boolean
  disconnectingZoom: boolean
  onConnectZoom: () => void
  onDisconnectZoom: () => void
}

export default function VideoConferencingCard({
  zoomConnected,
  googleCalendarConnected,
  outlookCalendarConnected,
  outlookTeamsCapable,
  connectingZoom,
  disconnectingZoom,
  onConnectZoom,
  onDisconnectZoom,
}: VideoConferencingCardProps) {
  return (
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
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
                  onClick={onDisconnectZoom}
                  disabled={disconnectingZoom}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnectZoom}
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

          {/* Google Meet */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg bg-green-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Video className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium">Google Meet</p>
                <p className="text-sm text-gray-500">
                  {googleCalendarConnected ? (
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

          {/* Microsoft Teams */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Video className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Microsoft Teams</p>
                <p className="text-sm text-gray-500">
                  {outlookCalendarConnected ? (
                    outlookTeamsCapable ? (
                      <>
                        <Check className="inline h-3 w-3 mr-1 text-green-500" />
                        Auto-enabled via Outlook Calendar
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="inline h-3 w-3 mr-1 text-amber-500" />
                        Your Outlook account doesn&apos;t support Teams meetings. A Microsoft 365 work/school account is required.
                      </>
                    )
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
  )
}
