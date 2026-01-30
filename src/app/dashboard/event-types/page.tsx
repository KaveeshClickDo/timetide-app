'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Clock,
  Video,
  MapPin,
  Phone,
  Copy,
  MoreVertical,
  Pencil,
  Trash2,
  ExternalLink,
  Plus,
  Link as LinkIcon,
  Loader2,
  CheckCircle2,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { cn, formatDuration } from '@/lib/utils'
import { EmbedCodeGenerator } from '@/components/embed-code-generator'

interface EventType {
  id: string
  title: string
  slug: string
  description: string | null
  length: number
  locationType: string
  isActive: boolean
  _count: {
    bookings: number
  }
}

const locationLabels: Record<string, { label: string; icon: typeof Video }> = {
  GOOGLE_MEET: { label: 'Google Meet', icon: Video },
  ZOOM: { label: 'Zoom', icon: Video },
  TEAMS: { label: 'Microsoft Teams', icon: Video },
  PHONE: { label: 'Phone Call', icon: Phone },
  IN_PERSON: { label: 'In Person', icon: MapPin },
  CUSTOM: { label: 'Custom Location', icon: Globe },
}

export default function EventTypesPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const username = session?.user?.username

  const { data: eventTypes, isLoading } = useQuery<EventType[]>({
    queryKey: ['eventTypes'],
    queryFn: async () => {
      const res = await fetch('/api/event-types')
      if (!res.ok) throw new Error('Failed to fetch event types')
      const data = await res.json()
      return data.eventTypes
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/event-types/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] })
      toast({
        title: 'Event type deleted',
        description: 'The event type has been removed.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete event type.',
        variant: 'destructive',
      })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/event-types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] })
    },
  })

  const copyLink = (slug: string, id: string) => {
    const link = `${window.location.origin}/${username}/${slug}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast({
      title: 'Link copied!',
      description: 'The booking link has been copied to your clipboard.',
    })
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
            Event Types
          </h1>
          <p className="text-gray-600">
            Create and manage the types of meetings people can book with you.
          </p>
        </div>
        <Link href="/dashboard/event-types/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Event Type
          </Button>
        </Link>
      </div>

      {/* Public link info */}
      {username && (
        <Card className="mb-6 bg-ocean-50 border-ocean-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center">
                  <LinkIcon className="h-5 w-5 text-ocean-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ocean-900">
                    Your public booking page
                  </p>
                  <p className="text-sm text-ocean-700">
                    {window.location.origin}/{username}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/${username}`
                    )
                    toast({ title: 'Link copied!' })
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Link href={`/${username}`} target="_blank">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Types List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
        </div>
      ) : !eventTypes?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No event types yet
            </h3>
            <p className="text-gray-500 mb-6">
              Create your first event type to start accepting bookings.
            </p>
            <Link href="/dashboard/event-types/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Event Type
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {eventTypes.map((eventType) => {
            const locationConfig = locationLabels[eventType.locationType] || {
              label: eventType.locationType,
              icon: Globe,
            }
            const LocationIcon = locationConfig.icon

            return (
              <Card
                key={eventType.id}
                className={cn(
                  'transition-all',
                  !eventType.isActive && 'opacity-60'
                )}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left section */}
                    <div className="flex items-start gap-4">
                      {/* Color indicator */}
                      <div className="w-1.5 h-14 rounded-full bg-ocean-500 flex-shrink-0" />

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {eventType.title}
                          </h3>
                          {!eventType.isActive && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                              Inactive
                            </span>
                          )}
                        </div>
                        {eventType.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                            {eventType.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatDuration(eventType.length)}
                          </div>
                          <div className="flex items-center gap-1">
                            <LocationIcon className="h-4 w-4" />
                            {locationConfig.label}
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            {eventType._count.bookings} bookings
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right section - Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyLink(eventType.slug, eventType.id)}
                      >
                        {copiedId === eventType.id ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy Link
                          </>
                        )}
                      </Button>

                      {username && (
                        <EmbedCodeGenerator
                          username={username}
                          eventSlug={eventType.slug}
                          eventTitle={eventType.title}
                        />
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/dashboard/event-types/${eventType.id}/edit`}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/${username}/${eventType.slug}`}
                              target="_blank"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Preview
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              toggleMutation.mutate({
                                id: eventType.id,
                                isActive: !eventType.isActive,
                              })
                            }
                          >
                            {eventType.isActive ? (
                              <>
                                <span className="h-4 w-4 mr-2 rounded-full border-2 border-gray-400 inline-block" />
                                Disable
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                                Enable
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              if (
                                confirm(
                                  'Are you sure you want to delete this event type?'
                                )
                              ) {
                                deleteMutation.mutate(eventType.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
