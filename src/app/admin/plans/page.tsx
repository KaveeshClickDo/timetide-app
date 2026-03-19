'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/admin/page-header'
import { Pencil, Check, X } from 'lucide-react'

interface Plan {
  id: string
  tier: string
  name: string
  price: number
  currency: string
  intervalDays: number
  isActive: boolean
  sortOrder: number
  description: string | null
  highlightText: string | null
  priceLabel: string | null
  priceSuffix: string | null
  maxEventTypes: number
  maxWebhooks: number
  customQuestions: boolean
  groupBooking: boolean
  recurringBooking: boolean
  teams: boolean
  analytics: boolean
  features: string[]
}

export default function AdminPlansPage() {
  const queryClient = useQueryClient()
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const res = await fetch('/api/admin/plans')
      if (!res.ok) throw new Error('Failed to fetch plans')
      return res.json()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<Plan> }) => {
      const res = await fetch(`/api/admin/plans/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.updates),
      })
      if (!res.ok) throw new Error('Failed to update plan')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] })
      setEditingPlan(null)
    },
  })

  return (
    <div>
      <PageHeader
        title="Plan Management"
        description="Configure subscription plans and feature limits."
      />

      {isLoading && <p className="text-gray-500">Loading plans...</p>}

      <div className="grid gap-6 md:grid-cols-3">
        {plans?.map((plan) => (
          <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <Badge variant="outline" className="mt-1">{plan.tier}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditingPlan(plan)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-2xl font-bold">
                  {plan.price === 0 ? 'Free' : `$${(plan.price / 100).toFixed(2)}`}
                  <span className="text-sm font-normal text-gray-500"> / {plan.intervalDays} days</span>
                </p>
              </div>

              <div className="space-y-1 text-sm">
                <p className="font-medium text-gray-700">Limits</p>
                <div className="grid grid-cols-2 gap-1 text-gray-600">
                  <span>Event Types: {plan.maxEventTypes >= 999999 ? '∞' : plan.maxEventTypes}</span>
                  <span>Webhooks: {plan.maxWebhooks >= 999999 ? '∞' : plan.maxWebhooks}</span>
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <p className="font-medium text-gray-700">Features</p>
                <div className="flex flex-wrap gap-1">
                  {plan.customQuestions && <Badge variant="secondary" className="text-xs">Questions</Badge>}
                  {plan.groupBooking && <Badge variant="secondary" className="text-xs">Group</Badge>}
                  {plan.recurringBooking && <Badge variant="secondary" className="text-xs">Recurring</Badge>}
                  {plan.teams && <Badge variant="secondary" className="text-xs">Teams</Badge>}
                  {plan.analytics && <Badge variant="secondary" className="text-xs">Analytics</Badge>}
                </div>
              </div>

              {!plan.isActive && (
                <Badge variant="destructive" className="text-xs">Inactive</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Plan Dialog */}
      <Dialog open={editingPlan !== null} onOpenChange={(open) => { if (!open) setEditingPlan(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {editingPlan && (
            <EditPlanForm
              plan={editingPlan}
              onSave={(updates) => updateMutation.mutate({ id: editingPlan.id, updates })}
              onCancel={() => setEditingPlan(null)}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EditPlanForm({
  plan,
  onSave,
  onCancel,
  loading,
}: {
  plan: Plan
  onSave: (updates: Partial<Plan>) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    name: plan.name,
    price: plan.price,
    intervalDays: plan.intervalDays,
    isActive: plan.isActive,
    description: plan.description ?? '',
    highlightText: plan.highlightText ?? '',
    priceLabel: plan.priceLabel ?? '',
    priceSuffix: plan.priceSuffix ?? '',
    maxEventTypes: plan.maxEventTypes,
    maxWebhooks: plan.maxWebhooks,
    customQuestions: plan.customQuestions,
    groupBooking: plan.groupBooking,
    recurringBooking: plan.recurringBooking,
    teams: plan.teams,
    analytics: plan.analytics,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      ...form,
      description: form.description || null,
      highlightText: form.highlightText || null,
      priceLabel: form.priceLabel || null,
      priceSuffix: form.priceSuffix || null,
    } as Partial<Plan>)
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit {plan.tier} Plan</DialogTitle>
        <DialogDescription>Update plan details and feature limits.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Price (cents)</Label>
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Interval (days)</Label>
            <Input type="number" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: parseInt(e.target.value) || 30 })} />
          </div>
          <div>
            <Label>Price Label</Label>
            <Input value={form.priceLabel} onChange={(e) => setForm({ ...form, priceLabel: e.target.value })} placeholder="$12" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Price Suffix</Label>
            <Input value={form.priceSuffix} onChange={(e) => setForm({ ...form, priceSuffix: e.target.value })} placeholder="/month" />
          </div>
          <div>
            <Label>Highlight Text</Label>
            <Input value={form.highlightText} onChange={(e) => setForm({ ...form, highlightText: e.target.value })} placeholder="Most Popular" />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <hr />
        <p className="text-sm font-medium text-gray-700">Numeric Limits</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Max Event Types</Label>
            <Input type="number" value={form.maxEventTypes} onChange={(e) => setForm({ ...form, maxEventTypes: parseInt(e.target.value) || 0 })} />
            <p className="text-xs text-gray-400 mt-1">Use 999999 for unlimited</p>
          </div>
          <div>
            <Label>Max Webhooks</Label>
            <Input type="number" value={form.maxWebhooks} onChange={(e) => setForm({ ...form, maxWebhooks: parseInt(e.target.value) || 0 })} />
            <p className="text-xs text-gray-400 mt-1">Use 999999 for unlimited</p>
          </div>
        </div>

        <hr />
        <p className="text-sm font-medium text-gray-700">Feature Toggles</p>

        <div className="space-y-3">
          {[
            { key: 'customQuestions', label: 'Custom Questions' },
            { key: 'groupBooking', label: 'Group Booking' },
            { key: 'recurringBooking', label: 'Recurring Booking' },
            { key: 'teams', label: 'Teams' },
            { key: 'analytics', label: 'Analytics' },
            { key: 'isActive', label: 'Plan Active' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch
                checked={form[key as keyof typeof form] as boolean}
                onCheckedChange={(checked) => setForm({ ...form, [key]: checked })}
              />
            </div>
          ))}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </form>
  )
}
