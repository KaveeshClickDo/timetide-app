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
import { DEFAULT_PAGE_SIZE } from '@/server/api-constants'
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

const subscriptionStatusColors: Record<string, string> = {
  NONE: 'bg-gray-100 text-gray-500',
  ACTIVE: 'bg-green-100 text-green-700',
  UNSUBSCRIBED: 'bg-amber-100 text-amber-700',
  GRACE_PERIOD: 'bg-orange-100 text-orange-700',
  DOWNGRADING: 'bg-orange-100 text-orange-700',
  LOCKED: 'bg-red-100 text-red-700',
}

const subscriptionStatusLabels: Record<string, string> = {
  NONE: 'None',
  ACTIVE: 'Active',
  UNSUBSCRIBED: 'Cancelled',
  GRACE_PERIOD: 'Grace Period',
  DOWNGRADING: 'Downgrading',
  LOCKED: 'Locked',
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [subscriptionFilter, setSubscriptionFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const pageSize = DEFAULT_PAGE_SIZE

  const { data, isLoading } = useQuery<{ users: AdminUserListItem[]; total: number }>({
    queryKey: ['admin-users', page, search, planFilter, roleFilter, statusFilter, subscriptionFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      })
      if (search) params.set('search', search)
      if (planFilter) params.set('plan', planFilter)
      if (roleFilter) params.set('role', roleFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (subscriptionFilter) params.set('subscriptionStatus', subscriptionFilter)
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
      key: 'role',
      header: 'Role',
      render: (user) => (
        <Badge className={cn('text-[10px]', roleColors[user.role] || roleColors.USER)}>
          {user.role}
        </Badge>
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
      key: 'subscriptionStatus',
      header: 'Subscription',
      render: (user) => (
        <Badge className={cn('text-[10px]', subscriptionStatusColors[user.subscriptionStatus] || subscriptionStatusColors.NONE)}>
          {subscriptionStatusLabels[user.subscriptionStatus] || user.subscriptionStatus}
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
          <div className="flex flex-wrap gap-2">
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plans</SelectItem>
                <SelectItem value="FREE">Free</SelectItem>
                <SelectItem value="PRO">Pro</SelectItem>
                <SelectItem value="TEAM">Team</SelectItem>
              </SelectContent>
            </Select>

            <Select value={subscriptionFilter} onValueChange={(v) => { setSubscriptionFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Subscriptions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Subscriptions</SelectItem>
                <SelectItem value="NONE">None</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="UNSUBSCRIBED">Cancelled</SelectItem>
                <SelectItem value="GRACE_PERIOD">Grace Period</SelectItem>
                <SelectItem value="DOWNGRADING">Downgrading</SelectItem>
                <SelectItem value="LOCKED">Locked</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'ALL' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={`${sortBy}-${sortOrder}`} onValueChange={(v) => {
              const [by, order] = v.split('-')
              setSortBy(by)
              setSortOrder(order as 'asc' | 'desc')
              setPage(1)
            }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt-desc">Newest first</SelectItem>
                <SelectItem value="createdAt-asc">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name A–Z</SelectItem>
                <SelectItem value="name-desc">Name Z–A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  )
}
