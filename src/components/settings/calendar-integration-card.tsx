'use client'

import {
  Calendar,
  Loader2,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface CalendarData {
  id: string
  name: string
  provider: string
  teamsCapable?: boolean
}

interface CalendarIntegrationCardProps {
  googleCalendar: CalendarData | null
  outlookCalendar: CalendarData | null
  connectingGoogle: boolean
  connectingOutlook: boolean
  disconnecting: boolean
  onConnectGoogle: () => void
  onConnectOutlook: () => void
  onDisconnect: (calendarId: string) => void
}

export default function CalendarIntegrationCard({
  googleCalendar,
  outlookCalendar,
  connectingGoogle,
  connectingOutlook,
  disconnecting,
  onConnectGoogle,
  onConnectOutlook,
  onDisconnect,
}: CalendarIntegrationCardProps) {
  return (
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
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
            <div className="flex gap-2 flex-shrink-0">
              {googleCalendar ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onConnectGoogle}
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
                    onClick={() => onDisconnect(googleCalendar.id)}
                    disabled={disconnecting}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnectGoogle}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
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
                    onClick={onConnectOutlook}
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
                    onClick={() => onDisconnect(outlookCalendar.id)}
                    disabled={disconnecting}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnectOutlook}
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
  )
}
