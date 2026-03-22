'use client'

import { Link as LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

interface BookingLinkCardProps {
  username: string
}

export default function BookingLinkCard({ username }: BookingLinkCardProps) {
  const { toast } = useToast()
  const bookingUrl = typeof window !== 'undefined' ? `${window.location.origin}/${username}` : `/${username}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          Booking Link
        </CardTitle>
        <CardDescription>Share this link to let others book time with you.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={bookingUrl}
            className="bg-gray-50"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/${username}`
              )
              toast({ title: 'Link copied!' })
            }}
          >
            Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
