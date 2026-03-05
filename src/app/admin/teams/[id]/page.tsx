'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader } from '@/components/admin/page-header'
import { cn, getInitials } from '@/lib/utils'
import type { AdminTeamDetail } from '@/types'

const roleColors: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-indigo-100 text-indigo-700',
  MEMBER: 'bg-gray-100 text-gray-600',
}

export default function AdminTeamDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: team, isLoading } = useQuery<AdminTeamDetail>({
    queryKey: ['admin-team', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/teams/${id}`)
      if (!res.ok) throw new Error('Failed to fetch team')
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!team) {
    return <p className="text-center py-20 text-gray-500">Team not found</p>
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/teams" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Teams
        </Link>
      </div>

      <PageHeader
        title={team.name}
        description={team.description || `/${team.slug}`}
      />

      {/* Team Info */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{team._count.members}</p>
            <p className="text-xs text-gray-500">Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{team._count.eventTypes}</p>
            <p className="text-xs text-gray-500">Event Types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{new Date(team.createdAt).toLocaleDateString()}</p>
            <p className="text-xs text-gray-500">Created</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members ({team.members.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {team.members.map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/users/${m.user.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {m.user.name ? getInitials(m.user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.user.name || m.user.email}</p>
                    <p className="text-xs text-gray-500 truncate">{m.user.email}</p>
                  </div>
                  <Badge className={cn('text-[10px]', roleColors[m.role] || roleColors.MEMBER)}>
                    {m.role}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Event Types */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Types ({team.eventTypes.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {team.eventTypes.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 text-center">No event types</p>
            ) : (
              <div className="divide-y">
                {team.eventTypes.map((et) => (
                  <div key={et.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium">{et.title}</p>
                      <p className="text-xs text-gray-500">{et.schedulingType || 'Personal'}</p>
                    </div>
                    <Badge className={cn('text-[10px]', et.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                      {et.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
