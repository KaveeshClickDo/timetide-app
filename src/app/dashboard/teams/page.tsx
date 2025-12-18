'use client'

import { Users, Plus, UserPlus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function TeamsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
            Teams
          </h1>
          <p className="text-gray-600">
            Create teams to enable round-robin and collective scheduling.
          </p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      {/* Coming Soon Card */}
      <Card>
        <CardContent className="py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-6">
            <Users className="h-10 w-10 text-ocean-500" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-gray-900 mb-3">
            Team Scheduling Coming Soon
          </h2>
          <p className="text-gray-600 max-w-md mx-auto mb-8">
            We&apos;re building powerful team scheduling features including round-robin assignment,
            collective availability, and shared booking pages.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 max-w-2xl mx-auto text-left">
            <div className="p-4 rounded-xl bg-gray-50">
              <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center mb-3">
                <Users className="h-5 w-5 text-ocean-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Round-Robin</h3>
              <p className="text-sm text-gray-500">
                Automatically distribute bookings across team members
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50">
              <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center mb-3">
                <UserPlus className="h-5 w-5 text-ocean-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Collective</h3>
              <p className="text-sm text-gray-500">
                Find times when all required team members are available
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50">
              <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center mb-3">
                <Settings className="h-5 w-5 text-ocean-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Team Pages</h3>
              <p className="text-sm text-gray-500">
                Shared booking pages with team branding
              </p>
            </div>
          </div>

          <div className="mt-8">
            <Button variant="outline" disabled>
              Notify Me When Available
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
