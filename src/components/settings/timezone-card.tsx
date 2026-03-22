'use client'

import { Globe } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TIMEZONES } from '@/lib/constants'

interface TimezoneCardProps {
  timezone: string
  timezoneAutoDetect: boolean
  setFormData: (updater: (prev: any) => any) => void
}

export default function TimezoneCard({
  timezone,
  timezoneAutoDetect,
  setFormData,
}: TimezoneCardProps) {
  return (
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
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={timezoneAutoDetect}
            onChange={(e) => {
              const autoDetect = e.target.checked
              setFormData((prev: any) => {
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

        {timezoneAutoDetect ? (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-ocean-50 border border-ocean-200 rounded-lg">
            <Globe className="h-4 w-4 text-ocean-600" />
            <span className="text-sm text-ocean-700 font-medium">
              {timezone}
            </span>
            <span className="text-xs text-ocean-500">
              ({TIMEZONES.find((tz) => tz.value === timezone)?.label || timezone})
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, timezone: e.target.value }))}
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
  )
}
