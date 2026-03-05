'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/admin/page-header'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import type { AdminTicketDetail } from '@/types'

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [reply, setReply] = useState('')

  const { data: ticket, isLoading } = useQuery<AdminTicketDetail>({
    queryKey: ['admin-ticket', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tickets/${id}`)
      if (!res.ok) throw new Error('Failed to fetch ticket')
      return res.json()
    },
  })

  const updateTicket = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update ticket')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] })
      toast({ title: 'Ticket updated' })
    },
  })

  const sendReply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tickets/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (!res.ok) throw new Error('Failed to send reply')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ticket', id] })
      setReply('')
      toast({ title: 'Reply sent' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!ticket) {
    return <p className="text-center py-20 text-gray-500">Ticket not found</p>
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/tickets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Tickets
        </Link>
      </div>

      <PageHeader title={ticket.subject} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - messages */}
        <div className="lg:col-span-2 space-y-4">
          {/* User info */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">From</p>
              <Link href={`/admin/users/${ticket.user.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                {ticket.user.name || ticket.user.email}
              </Link>
              <p className="text-xs text-gray-500">{ticket.user.email}</p>
            </CardContent>
          </Card>

          {/* Original message */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-2">
                {ticket.user.name || 'User'} &middot; {new Date(ticket.createdAt).toLocaleString()}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.message}</p>
            </CardContent>
          </Card>

          {/* Thread */}
          {ticket.messages.map((msg) => (
            <Card key={msg.id} className={cn(msg.isAdminReply && 'border-indigo-200 bg-indigo-50/50')}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-2">
                  {msg.isAdminReply ? (
                    <span className="text-indigo-600 font-medium">{msg.sender.name || 'Admin'}</span>
                  ) : (
                    msg.sender.name || 'User'
                  )}
                  {' '}&middot; {new Date(msg.createdAt).toLocaleString()}
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
              </CardContent>
            </Card>
          ))}

          {/* Reply form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Admin Reply</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); sendReply.mutate() }}>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply to the user..."
                  rows={4}
                  required
                />
                <div className="flex justify-end mt-3">
                  <Button type="submit" size="sm" disabled={sendReply.isPending || !reply.trim()}>
                    <Send className="h-4 w-4 mr-1" />
                    {sendReply.isPending ? 'Sending...' : 'Send Reply'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - ticket management */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={ticket.status}
                  onValueChange={(status) => updateTicket.mutate({ status })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Priority</Label>
                <Select
                  value={ticket.priority}
                  onValueChange={(priority) => updateTicket.mutate({ priority })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ticket.category && (
                <div>
                  <Label className="text-xs">Category</Label>
                  <p className="text-sm capitalize mt-1">{ticket.category}</p>
                </div>
              )}

              <div>
                <Label className="text-xs">Created</Label>
                <p className="text-sm mt-1">{new Date(ticket.createdAt).toLocaleString()}</p>
              </div>

              <div>
                <Label className="text-xs">Last Updated</Label>
                <p className="text-sm mt-1">{new Date(ticket.updatedAt).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Admin Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                defaultValue={ticket.adminNotes || ''}
                placeholder="Internal notes (not visible to user)"
                rows={3}
                onBlur={(e) => {
                  if (e.target.value !== (ticket.adminNotes || '')) {
                    updateTicket.mutate({ adminNotes: e.target.value || null })
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
