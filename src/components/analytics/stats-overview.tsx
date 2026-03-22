import { Calendar, TrendingUp, Clock, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsData } from '@/types/analytics'

interface StatsOverviewProps {
  stats: AnalyticsData['stats'] | undefined
}

export default function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
      <Card>
        <CardContent className="p-3 sm:pt-6 sm:px-6 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-ocean-100 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 sm:h-6 sm:w-6 text-ocean-600" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">
                {stats?.totalBookings ?? 0}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">Total Bookings</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:pt-6 sm:px-6 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">
                {stats?.thisMonthBookings ?? 0}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">This Month</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:pt-6 sm:px-6 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 sm:h-6 sm:w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">
                {stats?.totalHours ?? 0}h
              </p>
              <p className="text-xs sm:text-sm text-gray-500">Hours Booked</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:pt-6 sm:px-6 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">
                {stats?.uniqueGuests ?? 0}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">Unique Guests</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
