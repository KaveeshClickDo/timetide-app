'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  Save,
  Power,
  AlertCircle,
  Calendar,
  Users,
  AlertTriangle,
  Check,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useFeatureGate } from '@/hooks/use-feature-gate'
import { ProBadge } from '@/components/pro-badge'
import { useIntegrationStatus } from '@/hooks/use-integration-status'

interface PageProps {
  params: { id: string }
}

const LOCATION_TYPES = [
  { value: 'GOOGLE_MEET', label: 'Google Meet', icon: Video, description: 'Auto-generate meeting link' },
  { value: 'TEAMS', label: 'Microsoft Teams', icon: Video, description: 'Auto-generate Teams meeting link' },
  { value: 'ZOOM', label: 'Zoom', icon: Video, description: 'Use your Zoom account' },
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

interface Question {
  id?: string
  type: string
  label: string
  required: boolean
  placeholder?: string
  options?: string[]
}

function LocationIntegrationWarning({ locationType, googleCalendar, outlookCalendar, zoomConnected }: {
  locationType: string
  googleCalendar: any
  outlookCalendar: any
  zoomConnected: boolean
}) {
  const needsGoogle = locationType === 'GOOGLE_MEET' && !googleCalendar
  const needsOutlook = locationType === 'TEAMS' && !outlookCalendar
  const needsZoom = locationType === 'ZOOM' && !zoomConnected

  const isConnected =
    (locationType === 'GOOGLE_MEET' && googleCalendar) ||
    (locationType === 'TEAMS' && outlookCalendar) ||
    (locationType === 'ZOOM' && zoomConnected)

  if (!needsGoogle && !needsOutlook && !needsZoom && !isConnected) return null

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
        <p className="text-sm text-green-800">
          {locationType === 'GOOGLE_MEET' && 'Google Calendar connected — Meet links will be auto-generated.'}
          {locationType === 'TEAMS' && 'Outlook Calendar connected — Teams links will be auto-generated.'}
          {locationType === 'ZOOM' && 'Zoom connected — meeting links will be auto-generated.'}
        </p>
      </div>
    )
  }

  const serviceName = needsGoogle ? 'Google Calendar' : needsOutlook ? 'Outlook Calendar' : 'Zoom'

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            {serviceName} not connected
          </p>
          <p className="text-xs text-amber-700">
            Meeting links won&apos;t be auto-generated without this integration.
          </p>
        </div>
      </div>
      <Link href="/dashboard/settings" target="_blank">
        <Button type="button" variant="outline" size="sm" className="flex-shrink-0 text-xs">
          <ExternalLink className="h-3 w-3 mr-1" />
          Connect
        </Button>
      </Link>
    </div>
  )
}

export default function EditEventTypePage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { googleCalendar, outlookCalendar, zoomConnected } = useIntegrationStatus()

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: 30,
    locationType: 'GOOGLE_MEET',
    customLocation: '',
    bufferTimeBefore: 0,
    bufferTimeAfter: 0,
    minimumNotice: 60,
    maxBookingsPerDay: 0,
    requiresConfirmation: false,
    isActive: true,
    // Booking window settings
    periodType: 'ROLLING' as 'ROLLING' | 'RANGE' | 'UNLIMITED',
    periodDays: 30,
    periodStartDate: format(new Date(), 'yyyy-MM-dd'),
    periodEndDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    // Group booking settings
    isGroupBooking: false,
    seatsPerSlot: 1,
  })

  const [questions, setQuestions] = useState<Question[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Feature gates
  const customQuestionsGate = useFeatureGate('customQuestions')
  const groupBookingGate = useFeatureGate('groupBooking')
  const bufferGate = useFeatureGate('bufferTimes')
  const bookingLimitGate = useFeatureGate('bookingLimits')

  // Fetch event type
  const { data: eventTypeData, isLoading } = useQuery({
    queryKey: ['eventType', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/event-types/${params.id}`)
      if (!res.ok) throw new Error('Failed to fetch event type')
      return res.json()
    },
  })

  // Initialize form when data loads
  useEffect(() => {
    if (eventTypeData?.eventType) {
      const et = eventTypeData.eventType
      setFormData({
        title: et.title,
        description: et.description || '',
        duration: et.length,
        locationType: et.locationType,
        customLocation: et.locationValue || '',
        bufferTimeBefore: et.bufferTimeBefore,
        bufferTimeAfter: et.bufferTimeAfter,
        minimumNotice: et.minimumNotice,
        maxBookingsPerDay: et.maxBookingsPerDay || 0,
        requiresConfirmation: et.requiresConfirmation,
        isActive: et.isActive,
        // Booking window settings
        periodType: et.periodType || 'ROLLING',
        periodDays: et.periodDays || 30,
        periodStartDate: et.periodStartDate
          ? format(new Date(et.periodStartDate), 'yyyy-MM-dd')
          : format(new Date(), 'yyyy-MM-dd'),
        periodEndDate: et.periodEndDate
          ? format(new Date(et.periodEndDate), 'yyyy-MM-dd')
          : format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        // Group booking settings
        isGroupBooking: (et.seatsPerSlot || 1) > 1,
        seatsPerSlot: et.seatsPerSlot || 1,
      })

      if (et.questions && et.questions.length > 0) {
        setQuestions(et.questions.map((q: any) => ({
          id: q.id,
          type: q.type,
          label: q.label,
          required: q.required,
          placeholder: q.placeholder || '',
          options: q.options || [],
        })))
        setShowAdvanced(true)
      }
    }
  }, [eventTypeData])

  // Track changes
  useEffect(() => {
    if (eventTypeData?.eventType) {
      setHasChanges(true)
    }
  }, [formData, questions])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: formData.title,
        description: formData.description || undefined,
        length: formData.duration,
        locationType: formData.locationType,
        locationValue: formData.customLocation || undefined,
        bufferTimeBefore: formData.bufferTimeBefore,
        bufferTimeAfter: formData.bufferTimeAfter,
        minimumNotice: formData.minimumNotice,
        requiresConfirmation: formData.requiresConfirmation,
        isActive: formData.isActive,
        // Booking window settings
        periodType: formData.periodType,
      }

      // Add period-specific fields based on type
      if (formData.periodType === 'ROLLING') {
        payload.periodDays = formData.periodDays
        payload.periodStartDate = null
        payload.periodEndDate = null
      } else if (formData.periodType === 'RANGE') {
        payload.periodStartDate = new Date(formData.periodStartDate).toISOString()
        payload.periodEndDate = new Date(formData.periodEndDate).toISOString()
        payload.periodDays = null
      } else {
        // UNLIMITED
        payload.periodDays = null
        payload.periodStartDate = null
        payload.periodEndDate = null
      }

      if (formData.maxBookingsPerDay > 0) {
        payload.maxBookingsPerDay = formData.maxBookingsPerDay
      }

      // Include seatsPerSlot for group bookings
      if (formData.isGroupBooking && formData.seatsPerSlot > 1) {
        payload.seatsPerSlot = formData.seatsPerSlot
      } else {
        payload.seatsPerSlot = 1
      }

      if (questions.length > 0) {
        payload.questions = questions.map(({ id, ...q }) => q)
      } else {
        payload.questions = []
      }

      const res = await fetch(`/api/event-types/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventType', params.id] })
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] })
      setHasChanges(false)
      toast({
        title: 'Event type updated!',
        description: 'Your changes have been saved.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update',
        variant: 'destructive',
      })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/event-types/${params.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] })
      toast({
        title: 'Event type deleted',
        description: 'The event type has been removed.',
      })
      router.push('/dashboard/event-types')
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete event type.',
        variant: 'destructive',
      })
    },
  })

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await fetch(`/api/event-types/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onSuccess: (_, isActive) => {
      queryClient.invalidateQueries({ queryKey: ['eventType', params.id] })
      queryClient.invalidateQueries({ queryKey: ['eventTypes'] })
      toast({
        title: isActive ? 'Event type enabled' : 'Event type disabled',
        description: isActive 
          ? 'This event type is now accepting bookings.'
          : 'This event type will not accept new bookings.',
      })
    },
  })

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { type: 'TEXT', label: '', required: false },
    ])
  }

  const updateQuestion = (index: number, updates: Partial<Question>) => {
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
      toast({
        title: 'Title required',
        description: 'Please enter a title for your event type.',
        variant: 'destructive',
      })
      return
    }
    updateMutation.mutate()
  }

  const handleDelete = () => {
    setShowDeleteDialog(false)
    deleteMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
        </div>
      </div>
    )
  }

  if (!eventTypeData?.eventType) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Event type not found
            </h3>
            <Link href="/dashboard/event-types">
              <Button variant="outline">Back to Event Types</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/event-types"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Event Types
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-gray-900">
              Edit Event Type
            </h1>
            <p className="text-gray-600 mt-1">
              {eventTypeData.eventType._count.bookings} total bookings
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Active Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, isActive: checked })
                  toggleActiveMutation.mutate(checked)
                }}
              />
              <Label className="text-sm font-normal">
                {formData.isActive ? 'Active' : 'Inactive'}
              </Label>
            </div>
            {/* Delete Button */}
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:border-red-300"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Set up the basic details for your event type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., 30 Minute Meeting"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                placeholder="A brief description of this meeting type..."
              />
            </div>

            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, duration: d.value })}
                    className={cn(
                      'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                      formData.duration === d.value
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

            <LocationIntegrationWarning
              locationType={formData.locationType}
              googleCalendar={googleCalendar}
              outlookCalendar={outlookCalendar}
              zoomConnected={zoomConnected}
            />

            {(formData.locationType === 'IN_PERSON' || formData.locationType === 'CUSTOM') && (
              <div className="space-y-2 pt-4">
                <Label htmlFor="customLocation">
                  {formData.locationType === 'IN_PERSON' ? 'Address' : 'Location Details'}
                </Label>
                <Input
                  id="customLocation"
                  value={formData.customLocation}
                  onChange={(e) =>
                    setFormData({ ...formData, customLocation: e.target.value })
                  }
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

        {/* Booking Window */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Booking Window
            </CardTitle>
            <CardDescription>
              Control when invitees can book appointments with you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {[
                {
                  value: 'ROLLING',
                  label: 'Rolling Window',
                  description: 'Allow booking for the next X days from today',
                },
                {
                  value: 'RANGE',
                  label: 'Date Range',
                  description: 'Only allow booking within specific dates',
                },
                {
                  value: 'UNLIMITED',
                  label: 'Unlimited',
                  description: 'No date restrictions (use with caution)',
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, periodType: option.value as any })
                  }
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

            {/* ROLLING: Show days input */}
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

            {/* RANGE: Show start/end date pickers */}
            {formData.periodType === 'RANGE' && (
              <div className="pt-4 border-t space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={formData.periodStartDate}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) =>
                        setFormData({ ...formData, periodStartDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={formData.periodEndDate}
                      min={formData.periodStartDate}
                      onChange={(e) =>
                        setFormData({ ...formData, periodEndDate: e.target.value })
                      }
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Invitees can only book between these dates (inclusive)
                </p>
              </div>
            )}

            {/* UNLIMITED: Show warning */}
            {formData.periodType === 'UNLIMITED' && (
              <div className="pt-4 border-t">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">
                    Unlimited booking window allows invitees to book any date in the future.
                    This may result in bookings far into the future.
                  </p>
                </div>
              </div>
            )}
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
                        onChange={(e) =>
                          updateQuestion(index, { required: e.target.value === 'yes' })
                        }
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

            <Button type="button" variant="outline" onClick={addQuestion} disabled={!customQuestionsGate.canAccess}>
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
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
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
                  <p className="text-xs text-gray-500">
                    Up to {formData.seatsPerSlot} people can book each available time slot
                  </p>
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
                <CardDescription>Buffer times, booking limits, and more.</CardDescription>
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
                    value={formData.bufferTimeBefore}
                    disabled={!bufferGate.canAccess}
                    onChange={(e) =>
                      setFormData({ ...formData, bufferTimeBefore: parseInt(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Free time before each meeting
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Buffer After (minutes)
                    {!bufferGate.canAccess && <ProBadge feature="bufferTimes" />}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.bufferTimeAfter}
                    disabled={!bufferGate.canAccess}
                    onChange={(e) =>
                      setFormData({ ...formData, bufferTimeAfter: parseInt(e.target.value) || 0 })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, minimumNotice: parseInt(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-gray-500">
                    How far in advance must bookings be made
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Max Bookings Per Day
                    {!bookingLimitGate.canAccess && <ProBadge feature="bookingLimits" />}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.maxBookingsPerDay}
                    disabled={!bookingLimitGate.canAccess}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxBookingsPerDay: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-gray-500">0 = unlimited</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="requiresConfirmation"
                  checked={formData.requiresConfirmation}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requiresConfirmation: checked })
                  }
                />
                <Label htmlFor="requiresConfirmation" className="font-normal">
                  Require confirmation before booking is confirmed
                </Label>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard/event-types">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button 
            type="submit" 
            disabled={updateMutation.isPending || !hasChanges}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the event type "{eventTypeData.eventType.title}" and all
              associated bookings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}