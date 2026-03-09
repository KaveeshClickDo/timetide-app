'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'
import {
  Clock,
  Video,
  MapPin,
  Phone,
  Globe,
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Calendar,
  Users,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
import { Switch } from '@/components/ui/switch'
import { cn, getInitials } from '@/lib/utils'
import { useFeatureGate } from '@/hooks/use-feature-gate'
import { ProBadge } from '@/components/pro-badge'
import type { TeamMemberWithRole } from '@/types/team'
import type { QuestionInput } from '@/types/event-type'

const LOCATION_TYPES = [
  { value: 'GOOGLE_MEET', label: 'Google Meet', icon: Video, description: 'Auto-generate meeting link' },
  { value: 'TEAMS', label: 'Microsoft Teams', icon: Video, description: 'Auto-generate Teams meeting link' },
  { value: 'ZOOM', label: 'Zoom', icon: Video, description: 'Auto-generate Zoom meeting link' },
  { value: 'PHONE', label: 'Phone Call', icon: Phone, description: 'You or invitee will call' },
  { value: 'IN_PERSON', label: 'In Person', icon: MapPin, description: 'Meet at a physical location' },
  { value: 'CUSTOM', label: 'Custom', icon: Globe, description: 'Provide custom location details' },
]

const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
]

const QUESTION_TYPES = [
  { value: 'TEXT', label: 'Short Text' },
  { value: 'TEXTAREA', label: 'Long Text' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone Number' },
  { value: 'SELECT', label: 'Dropdown' },
]

export default function NewTeamEventTypePage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const teamId = params.id as string

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [questions, setQuestions] = useState<QuestionInput[]>([])
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    length: 30,
    locationType: 'GOOGLE_MEET',
    customLocation: '',
    schedulingType: 'COLLECTIVE' as 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
    memberIds: [] as string[],
    meetingOrganizerUserId: '' as string,
    periodType: 'ROLLING' as 'ROLLING' | 'RANGE' | 'UNLIMITED',
    periodDays: 30,
    periodStartDate: format(new Date(), 'yyyy-MM-dd'),
    periodEndDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    bufferTimeBefore: 0,
    bufferTimeAfter: 0,
    minimumNotice: 60,
    maxBookingsPerDay: 0,
    requiresConfirmation: false,
    // Group booking
    isGroupBooking: false,
    seatsPerSlot: 1,
    // Recurring
    allowsRecurring: false,
    recurringMaxWeeks: 12,
    recurringFrequency: 'weekly' as string,
    recurringInterval: 7,
    // Additional settings
    slotInterval: 0,
    hideNotes: false,
    successRedirectUrl: '',
  })

  // Feature gates
  const customQuestionsGate = useFeatureGate('customQuestions')
  const groupBookingGate = useFeatureGate('groupBooking')
  const recurringGate = useFeatureGate('recurringBooking')
  const bufferGate = useFeatureGate('bufferTimes')
  const bookingLimitGate = useFeatureGate('bookingLimits')

  // Fetch team details for members list
  const { data: teamData, isLoading: isTeamLoading } = useQuery<{ team: { id: string; name: string; slug: string; members: TeamMemberWithRole[] } }>({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}`)
      if (!res.ok) throw new Error('Failed to fetch team')
      return res.json()
    },
  })

  // Fetch integration connection status for team members
  const { data: integrationData } = useQuery<{
    members: Array<{
      memberId: string
      userId: string
      name: string | null
      email: string
      image: string | null
      integrations: {
        googleCalendar: boolean
        outlookCalendar: boolean
        zoom: boolean
      }
    }>
  }>({
    queryKey: ['team-member-integrations', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}/members/integrations`)
      if (!res.ok) throw new Error('Failed to fetch integrations')
      return res.json()
    },
  })

  // Helper to check if a member has the required integration for the selected location
  const getMemberConnectionStatus = (memberId: string) => {
    const member = integrationData?.members?.find((m) => m.memberId === memberId)
    if (!member) return { connected: false, label: 'Unknown' }

    switch (formData.locationType) {
      case 'GOOGLE_MEET':
        return { connected: member.integrations.googleCalendar, label: 'Google Calendar' }
      case 'TEAMS':
        return { connected: member.integrations.outlookCalendar, label: 'Outlook' }
      case 'ZOOM':
        return { connected: member.integrations.zoom, label: 'Zoom' }
      default:
        return { connected: true, label: '' }
    }
  }

  const isVideoConferenceLocation = ['GOOGLE_MEET', 'TEAMS', 'ZOOM'].includes(formData.locationType)

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: formData.title,
        slug: formData.slug,
        description: formData.description || undefined,
        length: formData.length,
        locationType: formData.locationType,
        locationValue: formData.customLocation || undefined,
        schedulingType: formData.schedulingType,
        memberIds: formData.memberIds,
        meetingOrganizerUserId: formData.meetingOrganizerUserId || undefined,
        periodType: formData.periodType,
        bufferTimeBefore: formData.bufferTimeBefore,
        bufferTimeAfter: formData.bufferTimeAfter,
        minimumNotice: formData.minimumNotice,
        requiresConfirmation: formData.requiresConfirmation,
      }

      if (formData.periodType === 'ROLLING') {
        payload.periodDays = formData.periodDays
      } else if (formData.periodType === 'RANGE') {
        payload.periodStartDate = new Date(formData.periodStartDate).toISOString()
        payload.periodEndDate = new Date(formData.periodEndDate).toISOString()
      }

      if (formData.maxBookingsPerDay > 0) {
        payload.maxBookingsPerDay = formData.maxBookingsPerDay
      }

      // Group booking
      if (formData.isGroupBooking && formData.seatsPerSlot > 1) {
        payload.seatsPerSlot = formData.seatsPerSlot
      }

      // Recurring
      if (formData.allowsRecurring) {
        payload.allowsRecurring = true
        payload.recurringMaxWeeks = formData.recurringMaxWeeks || 12
        payload.recurringFrequency = formData.recurringFrequency || 'weekly'
        if (formData.recurringFrequency === 'custom') {
          payload.recurringInterval = formData.recurringInterval || 7
        }
      }

      // Additional settings
      payload.hideNotes = formData.hideNotes
      if (formData.slotInterval > 0) {
        payload.slotInterval = formData.slotInterval
      }
      if (formData.successRedirectUrl.trim()) {
        payload.successRedirectUrl = formData.successRedirectUrl.trim()
      }

      // Questions
      if (questions.length > 0) {
        payload.questions = questions
      }

      const res = await fetch(`/api/teams/${teamId}/event-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create event type')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-event-types', teamId] })
      toast({ title: 'Event type created successfully' })
      router.push(`/dashboard/teams/${teamId}/event-types`)
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' })
    },
  })

  const handleTitleChange = (title: string) => {
    setFormData({
      ...formData,
      title,
      slug: title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    })
  }

  const toggleMemberSelection = (memberId: string) => {
    setFormData((prev) => {
      const isRemoving = prev.memberIds.includes(memberId)
      const newMemberIds = isRemoving
        ? prev.memberIds.filter((id) => id !== memberId)
        : [...prev.memberIds, memberId]

      let newOrganizer = prev.meetingOrganizerUserId
      if (isRemoving && prev.meetingOrganizerUserId) {
        // If removing the organizer, find their userId and reset
        const removedMember = integrationData?.members?.find((m) => m.memberId === memberId)
        if (removedMember && removedMember.userId === prev.meetingOrganizerUserId) {
          // Set to first remaining member's userId
          const firstRemaining = integrationData?.members?.find((m) => newMemberIds.includes(m.memberId))
          newOrganizer = firstRemaining?.userId || ''
        }
      } else if (!isRemoving && !prev.meetingOrganizerUserId) {
        // First member selected — auto-set as organizer
        const addedMember = integrationData?.members?.find((m) => m.memberId === memberId)
        if (addedMember) newOrganizer = addedMember.userId
      }

      return { ...prev, memberIds: newMemberIds, meetingOrganizerUserId: newOrganizer }
    })
  }

  const toggleSelectAll = () => {
    const allMemberIds = activeMembers.map((m) => m.id)
    const allSelected = allMemberIds.length > 0 && allMemberIds.every((id) => formData.memberIds.includes(id))

    if (allSelected) {
      setFormData((prev) => ({ ...prev, memberIds: [], meetingOrganizerUserId: '' }))
    } else {
      const firstMember = integrationData?.members?.find((m) => allMemberIds.includes(m.memberId))
      setFormData((prev) => ({
        ...prev,
        memberIds: allMemberIds,
        meetingOrganizerUserId: prev.meetingOrganizerUserId || firstMember?.userId || '',
      }))
    }
  }

  const addQuestion = () => {
    setQuestions([...questions, { type: 'TEXT', label: '', required: false }])
  }

  const updateQuestion = (index: number, updates: Partial<QuestionInput>) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], ...updates }
    setQuestions(updated)
  }

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      toast({ title: 'Title required', description: 'Please enter a title.', variant: 'destructive' })
      return
    }
    if (!formData.slug.trim()) {
      toast({ title: 'Slug required', description: 'Please enter a URL slug.', variant: 'destructive' })
      return
    }
    if (formData.memberIds.length === 0) {
      toast({ title: 'Members required', description: 'Select at least one team member.', variant: 'destructive' })
      return
    }
    createMutation.mutate()
  }

  if (isTeamLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  if (!teamData?.team) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-red-600">Failed to load team. Please try again.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/teams')}>
          Back to Teams
        </Button>
      </div>
    )
  }

  const team = teamData.team
  const activeMembers = team.members.filter((m) => m.isActive)

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/dashboard/teams/${teamId}/event-types`}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to {team.name} Event Types
        </Link>
        <h1 className="text-3xl font-heading font-bold text-gray-900">
          Create Team Event Type
        </h1>
        <p className="text-gray-600 mt-1">
          Create a new event type for {team.name}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Set up the basic details for your team event type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g., Team Consultation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">/team/{team.slug}/</span>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="team-consultation"
                  pattern="^[a-z0-9-]+$"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="A brief description of this event type..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, length: d.value })}
                    className={cn(
                      'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                      formData.length === d.value
                        ? 'border-ocean-500 bg-ocean-50 text-ocean-700'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scheduling Type */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduling Type</CardTitle>
            <CardDescription>
              How should bookings be distributed among team members?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { value: 'ROUND_ROBIN', label: 'Round Robin', description: 'Rotates between team members to balance workload' },
              { value: 'COLLECTIVE', label: 'Collective', description: 'All assigned members must be available for the booking' },
              { value: 'MANAGED', label: 'Managed', description: 'Admin assigns members manually to each booking' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormData({ ...formData, schedulingType: option.value as typeof formData.schedulingType })}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-lg border text-left transition-all w-full',
                  formData.schedulingType === option.value
                    ? 'border-ocean-500 bg-ocean-50 ring-2 ring-ocean-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    formData.schedulingType === option.value
                      ? 'border-ocean-500'
                      : 'border-gray-300'
                  )}
                >
                  {formData.schedulingType === option.value && (
                    <div className="w-2 h-2 rounded-full bg-ocean-500" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Assign Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Assign Members
            </CardTitle>
            <CardDescription>
              Select team members who will handle bookings for this event type.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeMembers.length > 1 && (
              <label className="flex items-center gap-3 p-3 mb-2 rounded-lg cursor-pointer transition-colors border border-gray-200 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={activeMembers.length > 0 && activeMembers.every((m) => formData.memberIds.includes(m.id))}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-ocean-600"
                />
                <span className="text-sm font-medium text-gray-700">Select All</span>
                <span className="text-xs text-gray-400">({activeMembers.length} members)</span>
              </label>
            )}
            <div className="space-y-2">
              {activeMembers.map((member) => (
                <label
                  key={member.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                    formData.memberIds.includes(member.id)
                      ? 'bg-ocean-50 border border-ocean-200'
                      : 'border border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={formData.memberIds.includes(member.id)}
                    onChange={() => toggleMemberSelection(member.id)}
                    className="h-4 w-4 rounded border-gray-300 text-ocean-600"
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.user.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.user.name || member.user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.user.name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
                  </div>
                </label>
              ))}
            </div>
            {formData.memberIds.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Select at least one member to handle bookings
              </p>
            )}
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
            <CardDescription>Where will this meeting take place?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {LOCATION_TYPES.map((loc) => (
                <button
                  key={loc.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, locationType: loc.value })}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-lg border text-left transition-all',
                    formData.locationType === loc.value
                      ? 'border-ocean-500 bg-ocean-50 ring-2 ring-ocean-500/20'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      formData.locationType === loc.value
                        ? 'bg-ocean-500 text-white'
                        : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    <loc.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{loc.label}</p>
                    <p className="text-sm text-gray-500">{loc.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {(formData.locationType === 'IN_PERSON' || formData.locationType === 'CUSTOM') && (
              <div className="space-y-2 pt-4">
                <Label htmlFor="customLocation">
                  {formData.locationType === 'IN_PERSON' ? 'Address' : 'Location Details'}
                </Label>
                <Input
                  id="customLocation"
                  value={formData.customLocation}
                  onChange={(e) => setFormData({ ...formData, customLocation: e.target.value })}
                  placeholder={
                    formData.locationType === 'IN_PERSON'
                      ? '123 Main St, City, Country'
                      : 'Enter location details or link'
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meeting Organizer - only for video conference locations with assigned members */}
        {isVideoConferenceLocation && formData.memberIds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Meeting Organizer
              </CardTitle>
              <CardDescription>
                Choose whose account will generate the meeting link. They must have the selected platform connected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {formData.memberIds.map((memberId) => {
                  const member = activeMembers.find((m) => m.id === memberId)
                  const integration = integrationData?.members?.find((m) => m.memberId === memberId)
                  const status = getMemberConnectionStatus(memberId)
                  if (!member) return null

                  return (
                    <label
                      key={memberId}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                        formData.meetingOrganizerUserId === integration?.userId
                          ? 'bg-ocean-50 border border-ocean-200'
                          : 'border border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      <input
                        type="radio"
                        name="meetingOrganizer"
                        checked={formData.meetingOrganizerUserId === integration?.userId}
                        onChange={() => setFormData({ ...formData, meetingOrganizerUserId: integration?.userId || '' })}
                        className="h-4 w-4 border-gray-300 text-ocean-600"
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.user.image || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(member.user.name || member.user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {member.user.name || 'Unnamed'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          status.connected
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        )}
                      >
                        {status.connected ? 'Connected' : 'Not connected'}
                      </span>
                    </label>
                  )
                })}
              </div>
              {formData.meetingOrganizerUserId && (() => {
                const selectedMemberId = integrationData?.members?.find(
                  (m) => m.userId === formData.meetingOrganizerUserId
                )?.memberId
                const status = selectedMemberId ? getMemberConnectionStatus(selectedMemberId) : null
                return status && !status.connected ? (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-800">
                      The selected organizer hasn&apos;t connected {status.label}. No meeting link will be auto-generated for bookings.
                    </p>
                  </div>
                ) : null
              })()}
            </CardContent>
          </Card>
        )}

        {/* Booking Window */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Booking Window
            </CardTitle>
            <CardDescription>
              Control when invitees can book appointments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {[
                { value: 'ROLLING', label: 'Rolling Window', description: 'Allow booking for the next X days from today' },
                { value: 'RANGE', label: 'Date Range', description: 'Only allow booking within specific dates' },
                { value: 'UNLIMITED', label: 'Unlimited', description: 'No date restrictions (use with caution)' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, periodType: option.value as typeof formData.periodType })}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-lg border text-left transition-all',
                    formData.periodType === option.value
                      ? 'border-ocean-500 bg-ocean-50 ring-2 ring-ocean-500/20'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      formData.periodType === option.value
                        ? 'border-ocean-500'
                        : 'border-gray-300'
                    )}
                  >
                    {formData.periodType === option.value && (
                      <div className="w-2 h-2 rounded-full bg-ocean-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{option.label}</p>
                    <p className="text-sm text-gray-500">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {formData.periodType === 'ROLLING' && (
              <div className="pt-4 border-t">
                <Label>Number of days into the future</Label>
                <div className="flex items-center gap-3 mt-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={formData.periodDays}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        periodDays: Math.min(365, Math.max(1, parseInt(e.target.value) || 30)),
                      })
                    }
                    className="w-24"
                  />
                  <span className="text-gray-500">days</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Invitees can book from today up to {formData.periodDays} days ahead
                </p>
              </div>
            )}

            {formData.periodType === 'RANGE' && (
              <div className="pt-4 border-t space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={formData.periodStartDate}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setFormData({ ...formData, periodStartDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={formData.periodEndDate}
                      min={formData.periodStartDate}
                      max={format(addDays(new Date(), 365 * 10), 'yyyy-MM-dd')}
                      onChange={(e) => setFormData({ ...formData, periodEndDate: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Invitees can only book between these dates (inclusive)
                </p>
              </div>
            )}

            {formData.periodType === 'UNLIMITED' && (
              <div className="pt-4 border-t">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">
                    Unlimited booking window allows invitees to book any date in the future.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Confirmation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium text-gray-900">Require Confirmation</p>
                <p className="text-sm text-gray-500">
                  Bookings will be held as pending until manually confirmed or declined.
                </p>
              </div>
              <Switch
                id="requiresConfirmation"
                checked={formData.requiresConfirmation}
                onCheckedChange={(checked) => setFormData({ ...formData, requiresConfirmation: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Custom Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Booking Questions
              <ProBadge feature="customQuestions" />
            </CardTitle>
            <CardDescription>
              Ask invitees for additional information when they book.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((question, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 border rounded-lg bg-gray-50"
              >
                <button type="button" className="mt-2 cursor-move text-gray-400">
                  <GripVertical className="h-4 w-4" />
                </button>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Question Type</Label>
                      <select
                        value={question.type}
                        onChange={(e) => updateQuestion(index, { type: e.target.value })}
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        {QUESTION_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Required</Label>
                      <select
                        value={question.required ? 'yes' : 'no'}
                        onChange={(e) => updateQuestion(index, { required: e.target.value === 'yes' })}
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="no">Optional</option>
                        <option value="yes">Required</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Question Label</Label>
                    <Input
                      value={question.label}
                      onChange={(e) => updateQuestion(index, { label: e.target.value })}
                      placeholder="e.g., What would you like to discuss?"
                      className="h-9"
                    />
                  </div>
                  {question.type === 'SELECT' && (
                    <div>
                      <Label className="text-xs">Options (comma-separated)</Label>
                      <Input
                        value={question.options?.join(', ') || ''}
                        onChange={(e) =>
                          updateQuestion(index, {
                            options: e.target.value.split(',').map((s) => s.trim()),
                          })
                        }
                        placeholder="Option 1, Option 2, Option 3"
                        className="h-9"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="mt-2 p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addQuestion}
              disabled={!customQuestionsGate.canAccess}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
              {!customQuestionsGate.canAccess && <span className="ml-1 text-[10px] text-ocean-600 font-semibold">PRO</span>}
            </Button>
          </CardContent>
        </Card>

        {/* Group Booking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Group Booking
              <ProBadge feature="groupBooking" />
            </CardTitle>
            <CardDescription>
              Allow multiple people to book the same time slot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="space-y-1">
                <p className="font-medium text-gray-900">Enable Group Booking</p>
                <p className="text-sm text-gray-500">
                  Multiple attendees can book the same slot (e.g., workshops, webinars, office hours)
                </p>
              </div>
              <button
                type="button"
                disabled={!groupBookingGate.canAccess}
                onClick={() => groupBookingGate.canAccess && setFormData({
                  ...formData,
                  isGroupBooking: !formData.isGroupBooking,
                  seatsPerSlot: !formData.isGroupBooking ? 10 : 1
                })}
                className={cn(
                  'relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors',
                  !groupBookingGate.canAccess ? 'bg-gray-100 cursor-not-allowed' :
                  formData.isGroupBooking ? 'bg-ocean-500' : 'bg-gray-200'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    formData.isGroupBooking ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
            {formData.isGroupBooking && groupBookingGate.canAccess && (
              <div className="pt-4 border-t space-y-4">
                <div className="space-y-2">
                  <Label>Maximum Seats Per Slot</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={2}
                      max={100}
                      value={formData.seatsPerSlot}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          seatsPerSlot: Math.min(100, Math.max(2, parseInt(e.target.value) || 2)),
                        })
                      }
                      className="w-24"
                    />
                    <span className="text-gray-500">attendees</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Use cases:</strong> Group classes, webinars, office hours, workshops, or any event where multiple guests can attend the same session.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recurring Bookings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Recurring Bookings
              <ProBadge feature="recurringBooking" />
            </CardTitle>
            <CardDescription>
              Allow invitees to book weekly recurring sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="space-y-1 min-w-0 mr-4">
                <p className="font-medium text-gray-900">Enable Recurring Bookings</p>
                <p className="text-sm text-gray-500">
                  Invitees can book this event as a recurring series
                </p>
              </div>
              <button
                type="button"
                disabled={!recurringGate.canAccess}
                onClick={() => recurringGate.canAccess && setFormData({ ...formData, allowsRecurring: !formData.allowsRecurring })}
                className={cn(
                  'relative inline-flex flex-shrink-0 h-6 w-11 items-center rounded-full transition-colors',
                  !recurringGate.canAccess ? 'bg-gray-100 cursor-not-allowed' :
                  formData.allowsRecurring ? 'bg-ocean-500' : 'bg-gray-200'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    formData.allowsRecurring ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
            {formData.allowsRecurring && (
              <div className="p-4 rounded-lg border space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Frequency
                  </label>
                  <select
                    value={formData.recurringFrequency}
                    onChange={(e) => setFormData({ ...formData, recurringFrequency: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ocean-500 focus:ring-ocean-500"
                  >
                    <option value="weekly">Every week</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Every month</option>
                    <option value="custom">Custom interval</option>
                  </select>
                </div>
                {formData.recurringFrequency === 'custom' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Repeat every (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={formData.recurringInterval}
                      onChange={(e) => setFormData({ ...formData, recurringInterval: Number(e.target.value) })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ocean-500 focus:ring-ocean-500"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Maximum sessions per series
                  </label>
                  <select
                    value={formData.recurringMaxWeeks}
                    onChange={(e) => setFormData({ ...formData, recurringMaxWeeks: Number(e.target.value) })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ocean-500 focus:ring-ocean-500"
                  >
                    {Array.from({ length: 23 }, (_, i) => i + 2).map((w) => (
                      <option key={w} value={w}>{w} sessions</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    Invitees can book up to this many occurrences (2-24)
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <CardTitle className="flex items-center gap-2">
                  Advanced Settings
                  <ProBadge feature="bufferTimes" />
                </CardTitle>
                <CardDescription>Buffer times, minimum notice, and booking limits.</CardDescription>
              </div>
              <span className="text-ocean-600 text-sm">
                {showAdvanced ? 'Hide' : 'Show'}
              </span>
            </button>
          </CardHeader>
          {showAdvanced && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Buffer Before (minutes)
                    {!bufferGate.canAccess && <ProBadge feature="bufferTimes" />}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={formData.bufferTimeBefore}
                    disabled={!bufferGate.canAccess}
                    onChange={(e) => setFormData({ ...formData, bufferTimeBefore: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-gray-500">Free time before each meeting</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Buffer After (minutes)
                    {!bufferGate.canAccess && <ProBadge feature="bufferTimes" />}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={formData.bufferTimeAfter}
                    disabled={!bufferGate.canAccess}
                    onChange={(e) => setFormData({ ...formData, bufferTimeAfter: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-gray-500">Free time after each meeting</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Notice (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.minimumNotice}
                    onChange={(e) => setFormData({ ...formData, minimumNotice: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-gray-500">How far in advance must bookings be made</p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Max Bookings Per Day
                    {!bookingLimitGate.canAccess && <ProBadge feature="bookingLimits" />}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.maxBookingsPerDay}
                    disabled={!bookingLimitGate.canAccess}
                    onChange={(e) => setFormData({ ...formData, maxBookingsPerDay: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-gray-500">0 = unlimited</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Slot Interval (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  max={720}
                  value={formData.slotInterval}
                  onChange={(e) =>
                    setFormData({ ...formData, slotInterval: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-gray-500">
                  Custom interval between available slots. 0 = use event duration as interval.
                </p>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="space-y-1">
                  <p className="font-medium text-gray-900">Hide Notes Field</p>
                  <p className="text-sm text-gray-500">
                    Hide the additional notes field from the booking form.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.hideNotes}
                  onChange={(e) => setFormData({ ...formData, hideNotes: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 text-ocean-600"
                />
              </div>

              <div className="space-y-2">
                <Label>Success Redirect URL</Label>
                <Input
                  type="url"
                  value={formData.successRedirectUrl}
                  onChange={(e) => setFormData({ ...formData, successRedirectUrl: e.target.value })}
                  placeholder="https://example.com/thank-you"
                />
                <p className="text-xs text-gray-500">
                  Redirect invitees to this URL after successful booking. Leave empty for default confirmation page.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <Link href={`/dashboard/teams/${teamId}/event-types`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMutation.isPending || formData.memberIds.length === 0}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Event Type'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
