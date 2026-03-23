'use client'

import { useState, useEffect } from 'react'
import { Download, X, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const DISMISS_KEY = 'timetide-pwa-install-dismissed'
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState(true) // Default hidden to avoid flash
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already running as installed PWA
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    setIsStandalone(standalone)

    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    setIsIos(ios)

    // Check dismiss state
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10)
      setDismissed(elapsed < DISMISS_DURATION_MS)
    } else {
      setDismissed(false)
    }

    // Listen for the browser's install prompt (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Don't show if already installed, dismissed, or not on a supported platform
  if (isStandalone || dismissed || (!installPrompt && !isIos)) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setDismissed(true)
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      setDismissed(true)
    }
  }

  return (
    <Card className="mb-6 border-ocean-200 bg-gradient-to-r from-ocean-50 to-cyan-50">
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-ocean-500 flex items-center justify-center flex-shrink-0">
              <Download className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900">
                Install TimeTide
              </p>
              <p className="text-sm text-gray-600">
                {isIos ? (
                  <>
                    Tap <Share className="inline h-3.5 w-3.5 -mt-0.5 mx-0.5" /> then &quot;Add to Home Screen&quot;
                  </>
                ) : (
                  'Add to your home screen for quick access'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isIos && (
              <Button size="sm" onClick={handleInstall}>
                Install
              </Button>
            )}
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-gray-200 rounded-md transition-colors"
              aria-label="Dismiss install banner"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
