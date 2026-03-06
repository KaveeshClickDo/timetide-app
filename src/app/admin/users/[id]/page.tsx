'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, Users, Globe, Shield, Ban, Eye,
  CheckCircle2, XCircle, Loader2, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/admin/page-header'
import { cn, getInitials } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import type { AdminUserDetail } from '@/types'

const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  PRO: 'bg-indigo-100 text-indigo-700',
  TEAM: 'bg-purple-100 text-purple-700',
}

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
}

const syncStatusColors: Record<string, string> = {
  SYNCED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  ERROR: 'bg-red-100 text-red-700',
  DISCONNECTED: 'bg-gray-100 text-gray-600',
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { update: updateSession } = useSession()
  const { toast } = useToast()
  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const [showImpersonateDialog, setShowImpersonateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const { data: user, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ['admin-user', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${id}`)
      if (!res.ok) throw new Error('Failed to fetch user')
      return res.json()
    },
  })

  const updateUser = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update user')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user', id] })
      toast({ title: 'User updated successfully' })
    },
    onError: () => {
      toast({ title: 'Failed to update user', variant: 'destructive' })
    },
  })

  const impersonate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${id}/impersonate`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to impersonate')
      }
      return res.json()
    },
    onSuccess: async (data) => {
      await updateSession({ impersonateUserId: data.userId })
      window.location.href = '/dashboard'
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: 'destructive' })
    },
  })

  const deleteUser = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'User deleted successfully' })
      router.push('/admin/users')
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: 'destructive' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">User not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/users')}>
          Back to Users
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>
      </div>

      <PageHeader
        title={user.name || user.email}
        description={user.email}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImpersonateDialog(true)}
              disabled={user.isDisabled}
            >
              <Eye className="h-4 w-4 mr-1" />
              Impersonate
            </Button>
            <Button
              variant={user.isDisabled ? 'default' : 'destructive'}
              size="sm"
              onClick={() => setShowDisableDialog(true)}
            >
              {user.isDisabled ? (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Enable</>
              ) : (
                <><Ban className="h-4 w-4 mr-1" /> Disable</>
              )}
            </Button>
            {user.role !== 'ADMIN' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      {/* Profile Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-lg">
                {user.name ? getInitials(user.name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Username</p>
                <p className="text-sm font-medium">{user.username || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Plan</p>
                <Select
                  value={user.plan}
                  onValueChange={(plan) => updateUser.mutate({ plan })}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">Free</SelectItem>
                    <SelectItem value="PRO">Pro</SelectItem>
                    <SelectItem value="TEAM">Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Role</p>
                <Select
                  value={user.role}
                  onValueChange={(role) => updateUser.mutate({ role })}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Timezone</p>
                <p className="text-sm font-medium">{user.timezone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Joined</p>
                <p className="text-sm font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-[10px]',
                    user.isDisabled
                      ? 'bg-red-100 text-red-700'
                      : !user.emailVerified
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                  )}>
                    {user.isDisabled ? 'Disabled' : !user.emailVerified ? 'Unverified' : 'Active'}
                  </Badge>
                  <Badge className={cn('text-[10px]',
                    user.onboardingCompleted ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                  )}>
                    {user.onboardingCompleted ? 'Onboarded' : 'Pending Onboarding'}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Email Verified</p>
                <p className="text-sm font-medium">
                  {user.emailVerified ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Stats</p>
                <p className="text-sm text-gray-600">
                  {user._count.bookingsAsHost} bookings &middot; {user._count.eventTypes} events &middot; {user._count.teamMemberships} teams
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="event-types">
        <TabsList>
          <TabsTrigger value="event-types">Event Types ({user.eventTypes.length})</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({user.bookingsAsHost.length})</TabsTrigger>
          <TabsTrigger value="teams">Teams ({user.teamMemberships.length})</TabsTrigger>
          <TabsTrigger value="calendars">Calendars ({user.calendars.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="event-types" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.eventTypes.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No event types</p>
              ) : (
                <div className="divide-y">
                  {user.eventTypes.map((et) => (
                    <div key={et.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{et.title}</p>
                        <p className="text-xs text-gray-500">/{user.username}/{et.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{et._count.bookings} bookings</span>
                        <Badge className={cn('text-[10px]', et.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                          {et.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.bookingsAsHost.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No bookings</p>
              ) : (
                <div className="divide-y">
                  {user.bookingsAsHost.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{b.eventType.title}</p>
                        <p className="text-xs text-gray-500">
                          {b.inviteeName} ({b.inviteeEmail})
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {new Date(b.startTime).toLocaleDateString()}
                        </span>
                        <Badge className={cn('text-[10px]', statusColors[b.status] || 'bg-gray-100 text-gray-600')}>
                          {b.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.teamMemberships.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No team memberships</p>
              ) : (
                <div className="divide-y">
                  {user.teamMemberships.map((tm) => (
                    <div key={tm.team.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{tm.team.name}</p>
                        <p className="text-xs text-gray-500">/{tm.team.slug}</p>
                      </div>
                      <Badge className="text-[10px] bg-gray-100 text-gray-600">{tm.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendars" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.calendars.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No calendars connected</p>
              ) : (
                <div className="divide-y">
                  {user.calendars.map((cal) => (
                    <div key={cal.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{cal.name}</p>
                        <p className="text-xs text-gray-500">{cal.provider}</p>
                      </div>
                      <Badge className={cn('text-[10px]', syncStatusColors[cal.syncStatus] || 'bg-gray-100 text-gray-600')}>
                        {cal.syncStatus}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Disable/Enable Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.isDisabled ? 'Enable User Account' : 'Disable User Account'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.isDisabled
                ? `This will re-enable ${user.name || user.email}'s account, allowing them to log in again.`
                : `This will disable ${user.name || user.email}'s account. They will not be able to log in or receive bookings.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateUser.mutate({ isDisabled: !user.isDisabled })
                setShowDisableDialog(false)
              }}
              className={user.isDisabled ? '' : 'bg-red-600 hover:bg-red-700'}
            >
              {user.isDisabled ? 'Enable Account' : 'Disable Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Impersonate Dialog */}
      <AlertDialog open={showImpersonateDialog} onOpenChange={setShowImpersonateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Impersonate User</AlertDialogTitle>
            <AlertDialogDescription>
              You will be viewing the platform as <strong>{user.name || user.email}</strong>.
              A banner will appear at the top of the page to exit impersonation.
              All your admin actions will be logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                impersonate.mutate()
                setShowImpersonateDialog(false)
              }}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Start Impersonation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{user.name || user.email}</strong> and all their data
              (event types, bookings, calendar connections, team memberships).
              This action cannot be undone. The user can sign up again as a new account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteUser.mutate()
                setShowDeleteDialog(false)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
