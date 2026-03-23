'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { DataTable, type Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import { DEFAULT_PAGE_SIZE } from '@/server/api-constants'
import type { AdminBookingListItem } from '@/types'

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-gray-100 text-gray-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
}

export default function AdminBookingsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const pageSize = DEFAULT_PAGE_SIZE

  const { data, isLoading } = useQuery<{ bookings: AdminBookingListItem[]; total: number }>({
    queryKey: ['admin-bookings', page, search, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/admin/bookings?${params}`)
      if (!res.ok) throw new Error('Failed to fetch bookings')
      return res.json()
    },
  })

  const columns: Column<AdminBookingListItem>[] = [
    {
      key: 'date',
      header: 'Date & Time',
      render: (b) => (
        <div>
          <p className="text-sm font-medium">{new Date(b.startTime).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500">
            {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' - '}
            {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      ),
    },
    {
      key: 'eventType',
      header: 'Event Type',
      render: (b) => <span className="text-sm">{b.eventType.title}</span>,
    },
    {
      key: 'host',
      header: 'Host',
      render: (b) => (
        <div>
          <p className="text-sm">{b.host.name || 'No name'}</p>
          <p className="text-xs text-gray-500">{b.host.email}</p>
        </div>
      ),
    },
    {
      key: 'invitee',
      header: 'Invitee',
      render: (b) => (
        <div>
          <p className="text-sm">{b.inviteeName}</p>
          <p className="text-xs text-gray-500">{b.inviteeEmail}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <Badge className={cn('text-[10px]', statusColors[b.status] || 'bg-gray-100 text-gray-600')}>
          {b.status}
        </Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Bookings"
        description={`${data?.total ?? 0} total bookings`}
      />

      <DataTable
        columns={columns}
        data={data?.bookings ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by invitee name or email..."
        emptyMessage="No bookings found"
        filters={
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="w-[160px]"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="w-[160px]"
              placeholder="To"
            />
          </div>
        }
      />
    </div>
  )
}
