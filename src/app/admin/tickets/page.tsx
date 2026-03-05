'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import type { AdminTicketListItem } from '@/types'

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

export default function AdminTicketsPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const pageSize = 20

  const { data, isLoading } = useQuery<{ tickets: AdminTicketListItem[]; total: number }>({
    queryKey: ['admin-tickets', page, statusFilter, priorityFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      const res = await fetch(`/api/admin/tickets?${params}`)
      if (!res.ok) throw new Error('Failed to fetch tickets')
      return res.json()
    },
  })

  const columns: Column<AdminTicketListItem>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (t) => (
        <div>
          <p className="text-sm font-medium">{t.subject}</p>
          {t.category && <p className="text-xs text-gray-500 capitalize">{t.category}</p>}
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (t) => (
        <div>
          <p className="text-sm">{t.user.name || 'No name'}</p>
          <p className="text-xs text-gray-500">{t.user.email}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (t) => (
        <Badge className={cn('text-[10px]', priorityColors[t.priority])}>
          {t.priority}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <Badge className={cn('text-[10px]', statusColors[t.status])}>
          {t.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'assignedAdmin',
      header: 'Assigned',
      render: (t) => (
        <span className="text-sm text-gray-500">
          {t.assignedAdmin?.name || 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (t) => (
        <span className="text-sm text-gray-500">
          {new Date(t.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        description={`${data?.total ?? 0} total tickets`}
      />

      <DataTable
        columns={columns}
        data={data?.tickets ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={(t) => router.push(`/admin/tickets/${t.id}`)}
        emptyMessage="No tickets found"
        filters={
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Priorities</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  )
}
