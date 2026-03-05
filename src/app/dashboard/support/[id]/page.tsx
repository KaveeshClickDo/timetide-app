'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
}

interface TicketDetail {
  id: string
  subject: string
  message: string
  status: string
  priority: string
  category: string | null
  createdAt: string
  updatedAt: string
  messages: {
    id: string
    message: string
    isAdminReply: boolean
    createdAt: string
    sender: { id: string; name: string | null; email: string }
  }[]
}

export default function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [reply, setReply] = useState('')

  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ['my-ticket', id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`)
      if (!res.ok) throw new Error('Failed to fetch ticket')
      return res.json()
    },
  })

  const sendReply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tickets/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (!res.ok) throw new Error('Failed to send reply')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ticket', id] })
      setReply('')
      toast({ title: 'Reply sent' })
    },
    onError: () => {
      toast({ title: 'Failed to send reply', variant: 'destructive' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  if (!ticket) {
    return <p className="text-center py-20 text-gray-500">Ticket not found</p>
  }

  const isClosed = ticket.status === 'CLOSED'

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/support" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Support
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-heading font-bold text-gray-900">{ticket.subject}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {ticket.category && <span className="capitalize">{ticket.category} &middot; </span>}
            Created {new Date(ticket.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge className={cn('text-xs', statusColors[ticket.status])}>
          {ticket.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Original message */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <p className="text-xs text-gray-500 mb-2">
            You &middot; {new Date(ticket.createdAt).toLocaleString()}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.message}</p>
        </CardContent>
      </Card>

      {/* Thread */}
      {ticket.messages.length > 0 && (
        <div className="space-y-3 mb-4">
          {ticket.messages.map((msg) => (
            <Card key={msg.id} className={cn(msg.isAdminReply && 'border-indigo-200 bg-indigo-50/50')}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-2">
                  {msg.isAdminReply ? (
                    <span className="text-indigo-600 font-medium">Support Team</span>
                  ) : (
                    'You'
                  )}
                  {' '}&middot; {new Date(msg.createdAt).toLocaleString()}
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reply form */}
      {!isClosed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reply</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); sendReply.mutate() }}>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply..."
                rows={3}
                required
                minLength={1}
              />
              <div className="flex justify-end mt-3">
                <Button type="submit" size="sm" disabled={sendReply.isPending || !reply.trim()}>
                  <Send className="h-4 w-4 mr-1" />
                  {sendReply.isPending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isClosed && (
        <p className="text-center text-sm text-gray-500 py-4">
          This ticket is closed. Create a new ticket if you need further help.
        </p>
      )}
    </div>
  )
}
