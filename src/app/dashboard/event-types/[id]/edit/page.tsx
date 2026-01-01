'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

interface PageProps {
  params: { id: string }
}

const LOCATION_TYPES = [
  { value: 'GOOGLE_MEET', label: 'Google Meet', icon: Video, description: 'Auto-generate meeting link' },
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

export default function EditEventTypePage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()

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
  })

  const [questions, setQuestions] = useState<Question[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

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
      }

      if (formData.maxBookingsPerDay > 0) {
        payload.maxBookingsPerDay = formData.maxBookingsPerDay
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

        {/* Custom Questions */}
        <Card>
          <CardHeader>
            <CardTitle>Booking Questions</CardTitle>
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

            <Button type="button" variant="outline" onClick={addQuestion}>
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
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
                <CardTitle>Advanced Settings</CardTitle>
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
                  <Label>Buffer Before (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.bufferTimeBefore}
                    onChange={(e) =>
                      setFormData({ ...formData, bufferTimeBefore: parseInt(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Free time before each meeting
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Buffer After (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.bufferTimeAfter}
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
                  <Label>Max Bookings Per Day</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.maxBookingsPerDay}
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