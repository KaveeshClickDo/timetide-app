'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import type { StripeWebhookLogEntry } from '@/types'

const statusColors: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700',
  ERROR: 'bg-red-100 text-red-700',
  UNHANDLED: 'bg-yellow-100 text-yellow-700',
}

export default function WebhookLogsPage() {
  const [page, setPage] = useState(1)
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const pageSize = 30

  const { data, isLoading } = useQuery<{ logs: StripeWebhookLogEntry[]; total: number }>({
    queryKey: ['admin-webhook-logs', page, eventTypeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (eventTypeFilter) params.set('eventType', eventTypeFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/webhook-logs?${params}`)
      if (!res.ok) throw new Error('Failed to fetch webhook logs')
      return res.json()
    },
  })

  const columns: Column<StripeWebhookLogEntry>[] = [
    {
      key: 'eventType',
      header: 'Event Type',
      render: (log) => (
        <span className="text-sm font-mono">{log.eventType}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (log) => (
        <Badge className={statusColors[log.processingStatus] || 'bg-gray-100 text-gray-600'}>
          {log.processingStatus}
        </Badge>
      ),
    },
    {
      key: 'eventId',
      header: 'Event ID',
      render: (log) => (
        <span className="text-xs text-gray-500 font-mono">{log.eventId.slice(0, 24)}...</span>
      ),
    },
    {
      key: 'error',
      header: 'Error',
      render: (log) => (
        <span className="text-xs text-red-600">
          {log.errorMessage ? (log.errorMessage.length > 60 ? log.errorMessage.slice(0, 60) + '...' : log.errorMessage) : '-'}
        </span>
      ),
    },
    {
      key: 'processingTime',
      header: 'Time',
      render: (log) => (
        <span className="text-sm text-gray-500">
          {log.processingTimeMs != null ? `${log.processingTimeMs}ms` : '-'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Received',
      render: (log) => (
        <span className="text-sm text-gray-500">
          {new Date(log.createdAt).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Stripe Webhook Logs"
        description="Monitor incoming Stripe webhook events and their processing status"
      />

      <DataTable
        columns={columns}
        data={data?.logs ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="No webhook events received yet"
        filters={
          <div className="flex gap-3">
            <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="All Event Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Event Types</SelectItem>
                <SelectItem value="customer.subscription.created">subscription.created</SelectItem>
                <SelectItem value="customer.subscription.updated">subscription.updated</SelectItem>
                <SelectItem value="customer.subscription.deleted">subscription.deleted</SelectItem>
                <SelectItem value="invoice.payment_succeeded">payment_succeeded</SelectItem>
                <SelectItem value="invoice.payment_failed">payment_failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
                <SelectItem value="UNHANDLED">Unhandled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  )
}
