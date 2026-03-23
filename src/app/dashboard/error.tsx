'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-heading font-bold text-gray-900">Something went wrong</h2>
      <p className="text-gray-600 max-w-md">
        An error occurred while loading this page. Please try again or contact support if the problem persists.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}
