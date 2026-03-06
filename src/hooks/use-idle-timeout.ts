'use client'

import { useEffect, useRef, useCallback } from 'react'
import { signOut } from 'next-auth/react'

const IDLE_TIMEOUT = 30 * 60 * 1000 // 30 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const
const THROTTLE_MS = 60_000 // Only reset timer once per minute to avoid perf overhead

export function useIdleTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef(Date.now())

  const resetTimer = useCallback(() => {
    const now = Date.now()
    // Throttle: only reset if at least 1 minute since last reset
    if (now - lastActivityRef.current < THROTTLE_MS) return
    lastActivityRef.current = now

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      signOut({ callbackUrl: '/auth/signin?reason=idle' })
    }, IDLE_TIMEOUT)
  }, [])

  useEffect(() => {
    // Start initial timer
    timerRef.current = setTimeout(() => {
      signOut({ callbackUrl: '/auth/signin?reason=idle' })
    }, IDLE_TIMEOUT)

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [resetTimer])
}
