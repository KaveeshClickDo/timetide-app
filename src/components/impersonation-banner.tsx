'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2 } from 'lucide-react'

export function ImpersonationBanner() {
  const { data: session, update } = useSession()
  const [exiting, setExiting] = useState(false)

  if (!session?.user?.impersonating) return null

  const handleExit = async () => {
    setExiting(true)
    await update({ exitImpersonation: true })
    window.location.href = '/admin/users'
  }

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-medium sticky top-0 z-[60]">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>Viewing as <strong>{session.user.name || session.user.email}</strong></span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="text-amber-900 border-amber-200 bg-amber-400/30 hover:bg-amber-400/50 h-7"
        onClick={handleExit}
        disabled={exiting}
      >
        {exiting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
        Exit Impersonation
      </Button>
    </div>
  )
}
