'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { MessageSquarePlus, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

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

interface TicketListItem {
  id: string
  subject: string
  status: string
  priority: string
  category: string | null
  createdAt: string
  updatedAt: string
}

export default function SupportPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  const { data, isLoading } = useQuery<{ tickets: TicketListItem[] }>({
    queryKey: ['my-tickets'],
    queryFn: async () => {
      const res = await fetch('/api/tickets')
      if (!res.ok) throw new Error('Failed to fetch tickets')
      return res.json()
    },
  })

  const createTicket = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, category: category || undefined, priority }),
      })
      if (!res.ok) throw new Error('Failed to create ticket')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] })
      setShowForm(false)
      setSubject('')
      setMessage('')
      setCategory('')
      setPriority('MEDIUM')
      toast({ title: 'Ticket submitted successfully' })
    },
    onError: () => {
      toast({ title: 'Failed to submit ticket', variant: 'destructive' })
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">Support</h1>
          <p className="text-sm text-gray-500 mt-1">Get help from our team</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <MessageSquarePlus className="h-4 w-4 mr-1" />
          New Ticket
        </Button>
      </div>

      {/* Create Ticket Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Submit a Support Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => { e.preventDefault(); createTicket.mutate() }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  required
                  minLength={5}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
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
              </div>
              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue in detail (min 20 characters)"
                  rows={5}
                  required
                  minLength={20}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createTicket.isPending}>
                  {createTicket.isPending ? 'Submitting...' : 'Submit Ticket'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tickets List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-gray-500 text-center">Loading...</p>
          ) : !data?.tickets?.length ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              No tickets yet. Click &quot;New Ticket&quot; to get help.
            </p>
          ) : (
            <div className="divide-y">
              {data.tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/support/${ticket.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {ticket.category && <span className="capitalize">{ticket.category} &middot; </span>}
                      Updated {new Date(ticket.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={cn('text-[10px]', priorityColors[ticket.priority])}>
                      {ticket.priority}
                    </Badge>
                    <Badge className={cn('text-[10px]', statusColors[ticket.status])}>
                      {ticket.status.replace('_', ' ')}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
