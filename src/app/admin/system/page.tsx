'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/admin/stat-card'
import { PageHeader } from '@/components/admin/page-header'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import type { SystemHealth } from '@/types'

const syncStatusColors: Record<string, string> = {
  SYNCED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  SYNCING: 'bg-blue-100 text-blue-700',
  ERROR: 'bg-red-100 text-red-700',
  DISCONNECTED: 'bg-gray-100 text-gray-600',
}

export default function AdminSystemPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading } = useQuery<SystemHealth>({
    queryKey: ['admin-system'],
    queryFn: async () => {
      const res = await fetch('/api/admin/system')
      if (!res.ok) throw new Error('Failed to fetch system health')
      return res.json()
    },
  })

  const retryDelivery = useMutation({
    mutationFn: async (deliveryId: string) => {
      const res = await fetch(`/api/admin/system/webhooks/${deliveryId}/retry`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to retry delivery')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system'] })
      toast({ title: 'Delivery queued for retry' })
    },
  })

  const successRate = data?.webhookHealth.total
    ? Math.round((data.webhookHealth.success / data.webhookHealth.total) * 100)
    : 0

  return (
    <div>
      <PageHeader
        title="System Monitoring"
        description="Webhook health and calendar sync status"
      />

      {isLoading ? (
        <p className="text-center py-20 text-gray-500">Loading...</p>
      ) : !data ? (
        <p className="text-center py-20 text-gray-500">No data available</p>
      ) : (
        <div className="space-y-6">
          {/* Webhook Health */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Total Deliveries"
              value={data.webhookHealth.total}
              icon={RefreshCw}
            />
            <StatCard
              title="Success Rate"
              value={`${successRate}%`}
              icon={CheckCircle2}
            />
            <StatCard
              title="Failed"
              value={data.webhookHealth.failed}
              icon={XCircle}
            />
            <StatCard
              title="Pending"
              value={data.webhookHealth.pending}
              icon={Clock}
            />
          </div>

          {/* Calendar Sync Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calendar Sync Status</CardTitle>
            </CardHeader>
            <CardContent>
              {data.calendarSyncStatus.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No calendars connected</p>
              ) : (
                <div className="flex gap-4 flex-wrap">
                  {data.calendarSyncStatus.map((item) => (
                    <div key={item.status} className="flex items-center gap-2">
                      <Badge className={cn('text-xs', syncStatusColors[item.status] || 'bg-gray-100 text-gray-600')}>
                        {item.status}
                      </Badge>
                      <span className="text-sm font-medium">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Failed Deliveries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Recent Failed Deliveries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentFailedDeliveries.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No failed deliveries</p>
              ) : (
                <div className="divide-y">
                  {data.recentFailedDeliveries.map((delivery) => (
                    <div key={delivery.id} className="flex items-center justify-between p-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {delivery.webhook.name || delivery.webhook.url}
                        </p>
                        <p className="text-xs text-gray-500">
                          {delivery.eventType} &middot; {new Date(delivery.createdAt).toLocaleString()}
                        </p>
                        {delivery.errorMessage && (
                          <p className="text-xs text-red-500 mt-1 truncate">{delivery.errorMessage}</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-4 flex-shrink-0"
                        onClick={() => retryDelivery.mutate(delivery.id)}
                        disabled={retryDelivery.isPending}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
