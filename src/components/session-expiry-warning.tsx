'use client'

import { useEffect, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
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
import { Clock } from 'lucide-react'

const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds
const WARNING_BEFORE = 5 * 60 // Show warning 5 minutes before expiry (in seconds)
const CHECK_INTERVAL = 60_000 // Check every minute

export function SessionExpiryWarning() {
  const { data: session } = useSession()
  const [showWarning, setShowWarning] = useState(false)
  const [remainingMinutes, setRemainingMinutes] = useState(0)

  useEffect(() => {
    if (!session?.user?.tokenIssuedAt) return

    const checkExpiry = () => {
      const issuedAt = session.user.tokenIssuedAt!
      const expiresAt = issuedAt + SESSION_MAX_AGE
      const now = Math.floor(Date.now() / 1000)
      const remaining = expiresAt - now

      if (remaining <= 0) {
        // Session already expired, sign out
        signOut({ callbackUrl: '/auth/signin?reason=expired' })
        return
      }

      if (remaining <= WARNING_BEFORE) {
        setRemainingMinutes(Math.max(1, Math.ceil(remaining / 60)))
        setShowWarning(true)
      }
    }

    checkExpiry()
    const interval = setInterval(checkExpiry, CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [session?.user?.tokenIssuedAt])

  const handleContinue = () => {
    setShowWarning(false)
    // Re-authenticate by redirecting to sign in
    signIn(undefined, { callbackUrl: window.location.pathname })
  }

  const handleSignOut = () => {
    setShowWarning(false)
    signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Session Expiring Soon
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire in approximately{' '}
            <span className="font-semibold text-gray-900">
              {remainingMinutes} {remainingMinutes === 1 ? 'minute' : 'minutes'}
            </span>
            . To continue working, please sign in again. Any unsaved changes may be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleSignOut}>
            Sign Out
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleContinue}>
            Continue Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
