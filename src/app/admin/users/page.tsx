'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import { cn, getInitials } from '@/lib/utils'
import type { AdminUserListItem } from '@/types'

const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  PRO: 'bg-indigo-100 text-indigo-700',
  TEAM: 'bg-purple-100 text-purple-700',
}

const roleColors: Record<string, string> = {
  USER: 'bg-gray-100 text-gray-600',
  ADMIN: 'bg-red-100 text-red-700',
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const pageSize = 20

  const { data, isLoading } = useQuery<{ users: AdminUserListItem[]; total: number }>({
    queryKey: ['admin-users', page, search, planFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      })
      if (search) params.set('search', search)
      if (planFilter) params.set('plan', planFilter)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    },
  })

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const columns: Column<AdminUserListItem>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image || undefined} />
            <AvatarFallback className="text-xs">
              {user.name ? getInitials(user.name) : 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.name || 'No name'}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (user) => (
        <Badge className={cn('text-[10px]', planColors[user.plan] || planColors.FREE)}>
          {user.plan}
        </Badge>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => (
        <Badge className={cn('text-[10px]', roleColors[user.role] || roleColors.USER)}>
          {user.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => {
        const isOAuthOnly = user.authProviders.length > 0 && !user.hasPassword
        const status = user.isDisabled
          ? { label: 'Disabled', color: 'bg-red-100 text-red-700' }
          : isOAuthOnly
            ? { label: 'Google', color: 'bg-blue-100 text-blue-700' }
            : !user.emailVerified
              ? { label: 'Unverified', color: 'bg-yellow-100 text-yellow-700' }
              : { label: 'Active', color: 'bg-green-100 text-green-700' }
        return (
          <Badge className={cn('text-[10px]', status.color)}>
            {status.label}
          </Badge>
        )
      },
    },
    {
      key: 'stats',
      header: 'Activity',
      render: (user) => (
        <div className="text-xs text-gray-500">
          <span>{user._count.bookingsAsHost} bookings</span>
          <span className="mx-1">&middot;</span>
          <span>{user._count.eventTypes} events</span>
          <span className="mx-1">&middot;</span>
          <span>{user._count.teamMemberships} teams</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      render: (user) => (
        <span className="text-sm text-gray-500">
          {new Date(user.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="User Management"
        description={`${data?.total ?? 0} total users`}
      />

      <DataTable
        columns={columns}
        data={data?.users ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by name, email, or username..."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={(user) => router.push(`/admin/users/${user.id}`)}
        emptyMessage="No users found"
        filters={
          <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v === 'ALL' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Plans" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Plans</SelectItem>
              <SelectItem value="FREE">Free</SelectItem>
              <SelectItem value="PRO">Pro</SelectItem>
              <SelectItem value="TEAM">Team</SelectItem>
            </SelectContent>
          </Select>
        }
      />
    </div>
  )
}
