'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable, Column } from '@/components/admin/data-table'
import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getInitials } from '@/lib/utils'
import { RotateCcw } from 'lucide-react'
import { DEFAULT_PAGE_SIZE } from '@/server/api-constants'

interface PaymentUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

interface Payment {
  id: string
  userId: string
  user: PaymentUser
  amount: number
  currency: string
  status: string
  stripePaymentIntentId: string | null
  planTier: string
  type: string
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  refundedAmount: number
  refundedAt: string | null
  refundReason: string | null
  failureReason: string | null
  createdAt: string
}

interface PaymentsResponse {
  payments: Payment[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const statusStyles: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-gray-100 text-gray-700',
  partial_refund: 'bg-yellow-100 text-yellow-700',
}

const typeLabels: Record<string, string> = {
  initial: 'Initial',
  renewal: 'Renewal',
  upgrade_proration: 'Upgrade',
}

export default function AdminPaymentsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')

  const { data, isLoading } = useQuery<PaymentsResponse>({
    queryKey: ['admin-payments', page, search, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(DEFAULT_PAGE_SIZE) })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/admin/payments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch payments')
      return res.json()
    },
  })

  const refundMutation = useMutation({
    mutationFn: async ({ id, amount, reason }: { id: string; amount?: number; reason?: string }) => {
      const res = await fetch(`/api/admin/payments/${id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to process refund')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] })
      setRefundPayment(null)
      setRefundAmount('')
      setRefundReason('')
    },
  })

  function openRefundDialog(payment: Payment) {
    const maxRefundable = payment.amount - (payment.refundedAmount || 0)
    setRefundPayment(payment)
    setRefundAmount(String(maxRefundable))
    setRefundReason('')
  }

  function handleRefund() {
    if (!refundPayment) return
    const maxRefundable = refundPayment.amount - (refundPayment.refundedAmount || 0)
    const amount = parseInt(refundAmount) || maxRefundable
    refundMutation.mutate({
      id: refundPayment.id,
      amount: Math.min(amount, maxRefundable),
      reason: refundReason || undefined,
    })
  }

  const columns: Column<Payment>[] = [
    {
      key: 'user',
      header: 'User',
      render: (p) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={p.user.image || undefined} />
            <AvatarFallback className="text-xs">
              {p.user.name ? getInitials(p.user.name) : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{p.user.name || 'Unknown'}</p>
            <p className="text-xs text-gray-500 truncate">{p.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (p) => (
        <div>
          <span className="font-medium">${(p.amount / 100).toFixed(2)}</span>
          <span className="text-gray-400 text-xs ml-1 uppercase">{p.currency}</span>
          {p.refundedAmount > 0 && (
            <p className="text-xs text-red-500">
              -${(p.refundedAmount / 100).toFixed(2)} refunded
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'planTier',
      header: 'Plan',
      render: (p) => <Badge variant="outline">{p.planTier}</Badge>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (p) => (
        <span className="text-sm">{typeLabels[p.type] || p.type}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge className={statusStyles[p.status] || 'bg-gray-100 text-gray-700'}>
          {p.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (p) => (
        <span className="text-sm text-gray-600">
          {new Date(p.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (p) => {
        const refundable = p.status === 'succeeded' || p.status === 'partial_refund'
        const hasRefundableAmount = p.amount - (p.refundedAmount || 0) > 0
        if (!refundable || !hasRefundableAmount || !p.stripePaymentIntentId) return null
        return (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => openRefundDialog(p)}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Refund
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Payment History"
        description="View all payments and manage refunds."
      />

      <DataTable
        columns={columns}
        data={data?.payments || []}
        total={data?.pagination.total || 0}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by user name or email..."
        emptyMessage="No payments found"
        filters={
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
                <SelectItem value="partial_refund">Partial Refund</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="initial">Initial</SelectItem>
                <SelectItem value="renewal">Renewal</SelectItem>
                <SelectItem value="upgrade_proration">Upgrade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Refund Dialog */}
      <Dialog open={refundPayment !== null} onOpenChange={(open) => { if (!open) setRefundPayment(null) }}>
        <DialogContent>
          {refundPayment && (
            <>
              <DialogHeader>
                <DialogTitle>Issue Refund</DialogTitle>
                <DialogDescription>
                  Refund payment of ${(refundPayment.amount / 100).toFixed(2)} for{' '}
                  {refundPayment.user.name || refundPayment.user.email}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Original Amount</span>
                    <span className="font-medium">${(refundPayment.amount / 100).toFixed(2)}</span>
                  </div>
                  {refundPayment.refundedAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Already Refunded</span>
                      <span className="text-red-600">-${(refundPayment.refundedAmount / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-gray-500">Max Refundable</span>
                    <span className="font-medium">
                      ${((refundPayment.amount - (refundPayment.refundedAmount || 0)) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <Label>Refund Amount (cents)</Label>
                  <Input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    max={refundPayment.amount - (refundPayment.refundedAmount || 0)}
                    min={1}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    ${(parseInt(refundAmount) / 100 || 0).toFixed(2)} will be refunded
                  </p>
                </div>

                <div>
                  <Label>Reason (optional)</Label>
                  <Input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g., Customer requested cancellation"
                  />
                </div>

                {refundMutation.isError && (
                  <p className="text-sm text-red-600">
                    {refundMutation.error instanceof Error ? refundMutation.error.message : 'Failed to process refund'}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setRefundPayment(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRefund}
                  disabled={refundMutation.isPending || !refundAmount || parseInt(refundAmount) <= 0}
                >
                  {refundMutation.isPending ? 'Processing...' : 'Confirm Refund'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
