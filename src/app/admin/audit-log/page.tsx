'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import type { AdminAuditLogEntry } from '@/types'

const actionColors: Record<string, string> = {
  UPDATE_USER: 'bg-blue-100 text-blue-700',
  IMPERSONATE_USER: 'bg-amber-100 text-amber-700',
  UPDATE_TICKET: 'bg-purple-100 text-purple-700',
  REPLY_TICKET: 'bg-green-100 text-green-700',
  RETRY_WEBHOOK_DELIVERY: 'bg-orange-100 text-orange-700',
}

export default function AdminAuditLogPage() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const pageSize = 30

  const { data, isLoading } = useQuery<{ logs: AdminAuditLogEntry[]; total: number }>({
    queryKey: ['admin-audit-log', page, actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (actionFilter) params.set('action', actionFilter)
      const res = await fetch(`/api/admin/audit-log?${params}`)
      if (!res.ok) throw new Error('Failed to fetch audit log')
      return res.json()
    },
  })

  const columns: Column<AdminAuditLogEntry>[] = [
    {
      key: 'admin',
      header: 'Admin',
      render: (log) => (
        <div>
          <p className="text-sm font-medium">{log.admin.name || 'Admin'}</p>
          <p className="text-xs text-gray-500">{log.admin.email}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => (
        <Badge className={`text-[10px] ${actionColors[log.action] || 'bg-gray-100 text-gray-600'}`}>
          {log.action.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (log) => (
        <span className="text-sm text-gray-500">
          {log.targetType ? `${log.targetType} ${log.targetId ? `(${log.targetId.slice(0, 8)}...)` : ''}` : '-'}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (log) => {
        if (!log.details) return <span className="text-sm text-gray-400">-</span>
        const details = log.details as Record<string, unknown>
        const summary = Object.entries(details)
          .slice(0, 2)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join(', ')
        return (
          <span className="text-xs text-gray-500 truncate block max-w-[200px]" title={JSON.stringify(details, null, 2)}>
            {summary || '-'}
          </span>
        )
      },
    },
    {
      key: 'createdAt',
      header: 'When',
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
        title="Audit Log"
        description="Track all admin actions"
      />

      <DataTable
        columns={columns}
        data={data?.logs ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="No audit log entries"
        filters={
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v === 'ALL' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Actions</SelectItem>
              <SelectItem value="UPDATE_USER">Update User</SelectItem>
              <SelectItem value="IMPERSONATE_USER">Impersonate User</SelectItem>
              <SelectItem value="UPDATE_TICKET">Update Ticket</SelectItem>
              <SelectItem value="REPLY_TICKET">Reply Ticket</SelectItem>
              <SelectItem value="RETRY_WEBHOOK_DELIVERY">Retry Webhook</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  )
}
