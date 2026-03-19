'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, Users, Globe, Shield, Ban, Eye,
  CheckCircle2, XCircle, Loader2, Trash2, AlertTriangle, Lock, Clock,
  Webhook, Ticket, History, Mail, Key,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
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

const subscriptionStatusColors: Record<string, string> = {
  NONE: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  UNSUBSCRIBED: 'bg-amber-100 text-amber-700',
  GRACE_PERIOD: 'bg-orange-100 text-orange-700',
  DOWNGRADING: 'bg-orange-100 text-orange-700',
  LOCKED: 'bg-red-100 text-red-700',
}

const subscriptionStatusLabels: Record<string, string> = {
  NONE: 'No Subscription',
  ACTIVE: 'Active',
  UNSUBSCRIBED: 'Cancelled',
  GRACE_PERIOD: 'Grace Period',
  DOWNGRADING: 'Downgrading',
  LOCKED: 'Locked',
}

const ticketStatusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
}

const historyActionColors: Record<string, string> = {
  upgrade: 'bg-green-100 text-green-700',
  reactivate: 'bg-green-100 text-green-700',
  downgrade: 'bg-orange-100 text-orange-700',
  unsubscribe: 'bg-amber-100 text-amber-700',
  grace_start: 'bg-orange-100 text-orange-700',
  locked: 'bg-red-100 text-red-700',
  cleanup: 'bg-red-100 text-red-700',
}

/** Which plans can a given plan be downgraded to */
const downgradeTargets: Record<string, string[]> = {
  TEAM: ['PRO', 'FREE'],
  PRO: ['FREE'],
  FREE: [],
}

/** Which plans can a given plan be upgraded to */
const upgradeTargets: Record<string, string[]> = {
  FREE: ['PRO', 'TEAM'],
  PRO: ['TEAM'],
  TEAM: [],
}

function formatInitiatedBy(initiatedBy: string): string {
  if (initiatedBy === 'user') return 'User'
  if (initiatedBy === 'system') return 'System'
  if (initiatedBy.startsWith('admin:')) return 'Admin'
  return initiatedBy
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
  const [showDowngradeDialog, setShowDowngradeDialog] = useState<'immediate' | 'grace' | null>(null)
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false)
  const [showCancelDowngradeDialog, setShowCancelDowngradeDialog] = useState(false)
  const [downgradeTargetPlan, setDowngradeTargetPlan] = useState('FREE')
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState('PRO')
  const [gracePeriodDays, setGracePeriodDays] = useState(30)

  const { data: user, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ['admin-user', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${id}`)
      if (!res.ok) throw new Error('Failed to fetch user')
      return res.json()
    },
  })

  const { data: downgradePreview, isLoading: previewLoading } = useQuery<{
    personalEventTypes: { active: number; toLock: number; toKeep: number; items: { id: string; title: string; slug: string }[] }
    webhooks: { active: number; toLock: number; toKeep: number; items: { id: string; name: string; url: string }[] }
    teamEventTypes: { active: number; toLock: number; items: { id: string; title: string; teamName: string | null }[] }
    featuresLost: string[]
  }>({
    queryKey: ['admin-downgrade-preview', id, downgradeTargetPlan],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${id}/downgrade-preview?targetPlan=${downgradeTargetPlan}`)
      if (!res.ok) throw new Error('Failed to fetch preview')
      return res.json()
    },
    enabled: showDowngradeDialog !== null,
  })

  const updateUser = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to update user')
      }
      return res.json()
    },
    onSuccess: (data: Record<string, unknown>) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user', id] })
      if (data?.warning) {
        toast({ title: 'User updated', description: String(data.warning), variant: 'destructive' })
      } else {
        toast({ title: 'User updated successfully' })
      }
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: 'destructive' })
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

  // Sign-up method display
  const signupMethod = user.isDisabled
    ? null
    : user.authProviders.includes('google')
      ? 'Google'
      : user.hasPassword
        ? 'Email & Password'
        : 'Pending'

  const personalEventTypes = user.eventTypes.filter((et) => !et.teamId)
  const teamEventTypes = user.eventTypes.filter((et) => et.teamId)
  const personalBookings = user.bookingsAsHost.filter((b) => !b.eventType.teamId)
  const teamBookings = user.bookingsAsHost.filter((b) => b.eventType.teamId)

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
                <Badge className={cn('text-xs', planColors[user.plan])}>
                  {user.plan}
                </Badge>
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
                <p className="text-xs text-gray-500 mb-1">Sign-up Method</p>
                <div className="flex items-center gap-1.5">
                  {signupMethod === 'Google' && (
                    <><Mail className="h-3.5 w-3.5 text-blue-500" /><span className="text-sm font-medium">Google</span></>
                  )}
                  {signupMethod === 'Email & Password' && (
                    <><Key className="h-3.5 w-3.5 text-gray-500" /><span className="text-sm font-medium">Email & Password</span></>
                  )}
                  {signupMethod === 'Pending' && (
                    <span className="text-sm text-yellow-600 font-medium">Pending</span>
                  )}
                  {!signupMethod && (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Status overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Subscription Status</p>
              <Badge className={cn('text-xs', subscriptionStatusColors[user.subscriptionStatus] || 'bg-gray-100 text-gray-600')}>
                {subscriptionStatusLabels[user.subscriptionStatus] || user.subscriptionStatus}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Plan Activated</p>
              <p className="text-sm font-medium">
                {user.planActivatedAt ? new Date(user.planActivatedAt).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Plan Expires</p>
              <p className="text-sm font-medium">
                {user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">
                {user.subscriptionStatus === 'LOCKED' ? 'Cleanup Scheduled' : 'Grace Period Ends'}
              </p>
              <p className="text-sm font-medium">
                {user.subscriptionStatus === 'LOCKED'
                  ? (user.cleanupScheduledAt ? new Date(user.cleanupScheduledAt).toLocaleDateString() : '—')
                  : (user.gracePeriodEndsAt ? new Date(user.gracePeriodEndsAt).toLocaleDateString() : '—')
                }
              </p>
            </div>
          </div>

          {/* Downgrade info if applicable */}
          {user.downgradeReason && (
            <div className="text-xs text-gray-500 mb-4">
              Reason: <span className="font-medium">{user.downgradeReason}</span>
              {user.downgradeInitiatedBy && <> &middot; By: <span className="font-medium">{user.downgradeInitiatedBy}</span></>}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Upgrade button */}
            {upgradeTargets[user.plan]?.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setUpgradeTargetPlan(upgradeTargets[user.plan][0])
                  setShowUpgradeDialog(true)
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Upgrade
              </Button>
            )}

            {/* Downgrade buttons - only for paid plans */}
            {downgradeTargets[user.plan]?.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-600 border-orange-200 hover:bg-orange-50"
                  onClick={() => {
                    setDowngradeTargetPlan(downgradeTargets[user.plan][downgradeTargets[user.plan].length - 1])
                    setGracePeriodDays(30)
                    setShowDowngradeDialog('grace')
                  }}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Downgrade with Grace
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    setDowngradeTargetPlan(downgradeTargets[user.plan][downgradeTargets[user.plan].length - 1])
                    setShowDowngradeDialog('immediate')
                  }}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Downgrade Immediately
                </Button>
              </>
            )}

            {/* Downgrading-specific: show cancel downgrade */}
            {user.subscriptionStatus === 'DOWNGRADING' && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setShowCancelDowngradeDialog(true)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel Downgrade
              </Button>
            )}

          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="event-types">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="event-types">
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Event Types ({user.eventTypes.length})
          </TabsTrigger>
          <TabsTrigger value="bookings">
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Bookings ({user.bookingsAsHost.length})
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Users className="h-3.5 w-3.5 mr-1" />
            Teams ({user.teamMemberships.length})
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            <Webhook className="h-3.5 w-3.5 mr-1" />
            Webhooks ({user.webhooks.length})
          </TabsTrigger>
          <TabsTrigger value="tickets">
            <Ticket className="h-3.5 w-3.5 mr-1" />
            Tickets ({user.supportTickets.length})
          </TabsTrigger>
          <TabsTrigger value="calendars">
            <Globe className="h-3.5 w-3.5 mr-1" />
            Calendars ({user.calendars.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1" />
            History ({user.subscriptionHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* Event Types Tab */}
        <TabsContent value="event-types" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.eventTypes.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No event types</p>
              ) : (
                <div className="divide-y">
                  {/* Personal */}
                  {personalEventTypes.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Personal ({personalEventTypes.length})</p>
                      </div>
                      {personalEventTypes.map((et) => (
                        <div key={et.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-medium">{et.title}</p>
                            <p className="text-xs text-gray-500">/{user.username}/{et.slug}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{et._count.bookings} bookings</span>
                            {et.lockedByDowngrade && (
                              <Badge className="text-[10px] bg-red-100 text-red-700">
                                <Lock className="h-2.5 w-2.5 mr-0.5" />
                                Locked
                              </Badge>
                            )}
                            <Badge className={cn('text-[10px]', et.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                              {et.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {/* Team */}
                  {teamEventTypes.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Team ({teamEventTypes.length})</p>
                      </div>
                      {teamEventTypes.map((et) => (
                        <div key={et.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-medium">{et.title}</p>
                            <p className="text-xs text-gray-500">
                              /team/{et.team?.slug ?? '?'}/{et.slug}
                              <span className="ml-1 text-purple-500">({et.team?.name ?? 'Team'})</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{et._count.bookings} bookings</span>
                            {et.lockedByDowngrade && (
                              <Badge className="text-[10px] bg-red-100 text-red-700">
                                <Lock className="h-2.5 w-2.5 mr-0.5" />
                                Locked
                              </Badge>
                            )}
                            <Badge className="text-[10px] bg-purple-100 text-purple-700">Team</Badge>
                            <Badge className={cn('text-[10px]', et.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                              {et.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bookings Tab */}
        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.bookingsAsHost.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No bookings</p>
              ) : (
                <div className="divide-y">
                  {/* Personal */}
                  {personalBookings.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Personal ({personalBookings.length})</p>
                      </div>
                      {personalBookings.map((b) => (
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
                    </>
                  )}
                  {/* Team */}
                  {teamBookings.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Team ({teamBookings.length})</p>
                      </div>
                      {teamBookings.map((b) => (
                        <div key={b.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-sm font-medium">{b.eventType.title}</p>
                            <p className="text-xs text-gray-500">
                              {b.inviteeName} ({b.inviteeEmail})
                              {b.eventType.team && (
                                <span className="ml-1 text-purple-500">· {b.eventType.team.name}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {new Date(b.startTime).toLocaleDateString()}
                            </span>
                            <Badge className="text-[10px] bg-purple-100 text-purple-700">Team</Badge>
                            <Badge className={cn('text-[10px]', statusColors[b.status] || 'bg-gray-100 text-gray-600')}>
                              {b.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teams Tab */}
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

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.webhooks.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No webhooks</p>
              ) : (
                <div className="divide-y">
                  {user.webhooks.map((wh) => (
                    <div key={wh.id} className="flex items-start justify-between p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{wh.name || 'Unnamed webhook'}</p>
                        <p className="text-xs text-gray-500 truncate">{wh.url}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {wh.eventTriggers.join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <span className="text-xs text-gray-400">
                          {new Date(wh.createdAt).toLocaleDateString()}
                        </span>
                        {wh.lockedByDowngrade && (
                          <Badge className="text-[10px] bg-red-100 text-red-700">
                            <Lock className="h-2.5 w-2.5 mr-0.5" />
                            Locked
                          </Badge>
                        )}
                        <Badge className={cn('text-[10px]', wh.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                          {wh.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.supportTickets.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No support tickets</p>
              ) : (
                <div className="divide-y">
                  {user.supportTickets.map((ticket) => (
                    <div key={ticket.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-medium">{ticket.subject}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] capitalize', 'bg-gray-100 text-gray-600')}>
                          {ticket.priority.toLowerCase()}
                        </Badge>
                        <Badge className={cn('text-[10px]', ticketStatusColors[ticket.status] || 'bg-gray-100 text-gray-600')}>
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                        <Link
                          href={`/admin/tickets/${ticket.id}`}
                          className="text-xs text-indigo-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calendars Tab */}
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

        {/* Subscription History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {user.subscriptionHistory.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 text-center">No subscription history</p>
              ) : (
                <div className="divide-y">
                  {user.subscriptionHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn('text-[10px] capitalize', historyActionColors[entry.action] || 'bg-gray-100 text-gray-600')}>
                            {entry.action.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            by {formatInitiatedBy(entry.initiatedBy)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">
                          <span className={cn('font-medium', planColors[entry.fromPlan]?.replace('bg-', 'text-').split(' ')[0] || '')}>
                            {entry.fromPlan}
                          </span>
                          {' → '}
                          <span className={cn('font-medium', planColors[entry.toPlan]?.replace('bg-', 'text-').split(' ')[0] || '')}>
                            {entry.toPlan}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({entry.fromStatus} → {entry.toStatus})
                          </span>
                        </p>
                        {entry.reason && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.reason}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 ml-4">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </span>
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

      {/* Upgrade Dialog */}
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade User Plan</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Upgrade <strong>{user.name || user.email}</strong> from{' '}
                  <Badge className={cn('text-xs', planColors[user.plan])}>{user.plan}</Badge> to:
                </p>
                <Select value={upgradeTargetPlan} onValueChange={setUpgradeTargetPlan}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {upgradeTargets[user.plan]?.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500">
                  This activates a 30-day billing period. If the user is currently locked (LOCKED status), all locked resources will be restored.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateUser.mutate({ planAction: 'upgrade', plan: upgradeTargetPlan })
                setShowUpgradeDialog(false)
              }}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Upgrade to {upgradeTargetPlan}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Downgrade Immediate Dialog */}
      <AlertDialog open={showDowngradeDialog === 'immediate'} onOpenChange={() => setShowDowngradeDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade Immediately</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Downgrade <strong>{user.name || user.email}</strong> from{' '}
                  <Badge className={cn('text-xs', planColors[user.plan])}>{user.plan}</Badge> to:
                </p>
                {downgradeTargets[user.plan]?.length > 1 && (
                  <Select value={downgradeTargetPlan} onValueChange={setDowngradeTargetPlan}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {downgradeTargets[user.plan]?.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {downgradeTargets[user.plan]?.length === 1 && (
                  <Badge className={cn('text-xs', planColors[downgradeTargetPlan])}>{downgradeTargetPlan}</Badge>
                )}
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 space-y-2">
                  <p className="font-medium">This action takes effect immediately:</p>
                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-xs text-red-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading impact preview…
                    </div>
                  ) : downgradePreview ? (
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      {downgradePreview.personalEventTypes.toLock > 0 && (
                        <li>
                          {downgradePreview.personalEventTypes.toLock} event type{downgradePreview.personalEventTypes.toLock !== 1 ? 's' : ''} will be locked
                          {downgradePreview.personalEventTypes.items.length > 0 && (
                            <span className="text-red-500"> ({downgradePreview.personalEventTypes.items.map(e => e.title).join(', ')})</span>
                          )}
                        </li>
                      )}
                      {downgradePreview.webhooks.toLock > 0 && (
                        <li>
                          {downgradePreview.webhooks.toLock} webhook{downgradePreview.webhooks.toLock !== 1 ? 's' : ''} will be deactivated
                          {downgradePreview.webhooks.items.length > 0 && (
                            <span className="text-red-500"> ({downgradePreview.webhooks.items.map(w => w.name || w.url).join(', ')})</span>
                          )}
                        </li>
                      )}
                      {downgradePreview.teamEventTypes.toLock > 0 && (
                        <li>
                          {downgradePreview.teamEventTypes.toLock} team event type{downgradePreview.teamEventTypes.toLock !== 1 ? 's' : ''} will be locked
                        </li>
                      )}
                      {downgradePreview.featuresLost.length > 0 && (
                        <li>Features lost: {downgradePreview.featuresLost.join(', ')}</li>
                      )}
                      {downgradePreview.personalEventTypes.toLock === 0 &&
                       downgradePreview.webhooks.toLock === 0 &&
                       downgradePreview.teamEventTypes.toLock === 0 &&
                       downgradePreview.featuresLost.length === 0 && (
                        <li>No resources will be locked by this downgrade</li>
                      )}
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>Features exceeding the target plan will be locked</li>
                      <li>Excess event types and webhooks will be deactivated</li>
                    </ul>
                  )}
                  <p className="text-xs text-red-500">Locked resources are preserved — user can upgrade to reactivate</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateUser.mutate({ planAction: 'downgrade_immediate', plan: downgradeTargetPlan })
                setShowDowngradeDialog(null)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Downgrade Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Downgrade Dialog */}
      <AlertDialog open={showCancelDowngradeDialog} onOpenChange={setShowCancelDowngradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Scheduled Downgrade</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the scheduled downgrade for <strong>{user.name || user.email}</strong>.
              Their <Badge className={cn('text-xs', planColors[user.plan])}>{user.plan}</Badge> plan
              will remain active and the grace period will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Downgrade</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateUser.mutate({ planAction: 'cancel_downgrade' })
                setShowCancelDowngradeDialog(false)
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Cancel Downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Downgrade with Grace Dialog */}
      <AlertDialog open={showDowngradeDialog === 'grace'} onOpenChange={() => setShowDowngradeDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade with Grace Period</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Schedule a downgrade for <strong>{user.name || user.email}</strong> from{' '}
                  <Badge className={cn('text-xs', planColors[user.plan])}>{user.plan}</Badge> to:
                </p>
                {downgradeTargets[user.plan]?.length > 1 && (
                  <Select value={downgradeTargetPlan} onValueChange={setDowngradeTargetPlan}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {downgradeTargets[user.plan]?.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {downgradeTargets[user.plan]?.length === 1 && (
                  <Badge className={cn('text-xs', planColors[downgradeTargetPlan])}>{downgradeTargetPlan}</Badge>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Grace period (days)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                    className="w-32"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    User keeps current features for {gracePeriodDays} day{gracePeriodDays !== 1 ? 's' : ''}. After that, resources are locked.
                  </p>
                </div>
                <div className="rounded-md bg-orange-50 p-3 text-sm text-orange-700 space-y-2">
                  <p className="font-medium">After grace period ends:</p>
                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-xs text-orange-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading impact preview…
                    </div>
                  ) : downgradePreview ? (
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      {downgradePreview.personalEventTypes.toLock > 0 && (
                        <li>
                          {downgradePreview.personalEventTypes.toLock} event type{downgradePreview.personalEventTypes.toLock !== 1 ? 's' : ''} will be locked
                          {downgradePreview.personalEventTypes.items.length > 0 && (
                            <span className="text-orange-500"> ({downgradePreview.personalEventTypes.items.map(e => e.title).join(', ')})</span>
                          )}
                        </li>
                      )}
                      {downgradePreview.webhooks.toLock > 0 && (
                        <li>
                          {downgradePreview.webhooks.toLock} webhook{downgradePreview.webhooks.toLock !== 1 ? 's' : ''} will be deactivated
                        </li>
                      )}
                      {downgradePreview.teamEventTypes.toLock > 0 && (
                        <li>
                          {downgradePreview.teamEventTypes.toLock} team event type{downgradePreview.teamEventTypes.toLock !== 1 ? 's' : ''} will be locked
                        </li>
                      )}
                      {downgradePreview.featuresLost.length > 0 && (
                        <li>Features lost: {downgradePreview.featuresLost.join(', ')}</li>
                      )}
                      {downgradePreview.personalEventTypes.toLock === 0 &&
                       downgradePreview.webhooks.toLock === 0 &&
                       downgradePreview.teamEventTypes.toLock === 0 &&
                       downgradePreview.featuresLost.length === 0 && (
                        <li>No resources will be locked by this downgrade</li>
                      )}
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>Features exceeding the target plan will be locked</li>
                      <li>Excess event types and webhooks will be deactivated</li>
                    </ul>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateUser.mutate({
                  planAction: 'downgrade_grace',
                  plan: downgradeTargetPlan,
                  gracePeriodDays,
                })
                setShowDowngradeDialog(null)
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Schedule Downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
