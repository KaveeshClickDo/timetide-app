'use client'

import { type ReactNode } from 'react'
import {
  ChevronLeft,
  Loader2,
  User,
  Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Question } from '@/types/event-type'

interface BookingFormData {
  name: string
  email: string
  notes: string
  responses: Record<string, string>
}

interface BookingFormProps {
  formData: BookingFormData
  setFormData: (data: BookingFormData) => void
  questions: Question[]
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
  isPending: boolean
  error: Error | null
  submitLabel: string
  pendingLabel: string
  children?: ReactNode
}

export default function BookingForm({
  formData,
  setFormData,
  questions,
  onSubmit,
  onBack,
  isPending,
  error,
  submitLabel,
  pendingLabel,
  children,
}: BookingFormProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          Enter Details
        </h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Your Name *</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="pl-10"
              placeholder="John Doe"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="pl-10"
              placeholder="you@example.com"
              required
            />
          </div>
        </div>

        {/* Custom questions */}
        {questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <Label>
              {question.label}
              {question.required && ' *'}
            </Label>
            {question.type === 'TEXT' || question.type === 'EMAIL' || question.type === 'PHONE' ? (
              <Input
                type={question.type === 'EMAIL' ? 'email' : question.type === 'PHONE' ? 'tel' : 'text'}
                value={formData.responses[question.id] || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    responses: { ...formData.responses, [question.id]: e.target.value },
                  })
                }
                placeholder={question.placeholder ?? undefined}
                required={question.required}
              />
            ) : question.type === 'TEXTAREA' ? (
              <textarea
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                value={formData.responses[question.id] || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    responses: { ...formData.responses, [question.id]: e.target.value },
                  })
                }
                placeholder={question.placeholder ?? undefined}
                required={question.required}
              />
            ) : question.type === 'SELECT' && question.options ? (
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={formData.responses[question.id] || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    responses: { ...formData.responses, [question.id]: e.target.value },
                  })
                }
                required={question.required}
              >
                <option value="">Select an option</option>
                {question.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ))}

        <div className="space-y-2">
          <Label htmlFor="notes">Additional Notes</Label>
          <textarea
            id="notes"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Anything you'd like to share before the meeting..."
          />
        </div>

        {/* Slot for recurring section or other widget-specific content */}
        {children}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-red-600 text-sm">
              {error instanceof Error
                ? error.message
                : 'Something went wrong. Please try again.'}
            </p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {pendingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </form>
    </div>
  )
}
