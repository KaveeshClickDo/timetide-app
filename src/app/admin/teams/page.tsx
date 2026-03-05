'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import type { AdminTeamListItem } from '@/types'

export default function AdminTeamsPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const pageSize = 20

  const { data, isLoading } = useQuery<{ teams: AdminTeamListItem[]; total: number }>({
    queryKey: ['admin-teams', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/teams?${params}`)
      if (!res.ok) throw new Error('Failed to fetch teams')
      return res.json()
    },
  })

  const columns: Column<AdminTeamListItem>[] = [
    {
      key: 'name',
      header: 'Team',
      render: (t) => (
        <div>
          <p className="text-sm font-medium">{t.name}</p>
          <p className="text-xs text-gray-500">/{t.slug}</p>
        </div>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      render: (t) => <span className="text-sm">{t._count.members}</span>,
    },
    {
      key: 'eventTypes',
      header: 'Event Types',
      render: (t) => <span className="text-sm">{t._count.eventTypes}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (t) => (
        <span className="text-sm text-gray-500">
          {new Date(t.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Teams"
        description={`${data?.total ?? 0} total teams`}
      />

      <DataTable
        columns={columns}
        data={data?.teams ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by team name..."
        onRowClick={(t) => router.push(`/admin/teams/${t.id}`)}
        emptyMessage="No teams found"
      />
    </div>
  )
}
