'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type VerificationType = 'BOOKING_CREATE' | 'BOOKING_MANAGE'

interface EmailVerificationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
  type: VerificationType
  onVerified: (proof: VerificationProof) => void
}

export interface VerificationProof {
  email: string
  code: string
  type: VerificationType
  signature: string
  expiresAt: number
}

export default function EmailVerification({
  open,
  onOpenChange,
  email,
  type,
  onVerified,
}: EmailVerificationProps) {
  const [step, setStep] = useState<'send' | 'verify'>('send')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [signature, setSignature] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('send')
      setCode(['', '', '', '', '', ''])
      setError('')
      setSignature('')
      setExpiresAt(0)
    }
  }, [open])

  const sendCode = useCallback(async () => {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/verify-email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send code')
        return
      }
      setSignature(data.signature)
      setExpiresAt(data.expiresAt)
      setStep('verify')
      setCode(['', '', '', '', '', ''])
      // Focus first input after render
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    } catch {
      setError('Failed to send verification code. Please try again.')
    } finally {
      setSending(false)
    }
  }, [email, type])

  const verifyCodeSubmit = useCallback(async () => {
    const fullCode = code.join('')
    if (fullCode.length !== 6) {
      setError('Please enter the full 6-digit code')
      return
    }

    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/verify-email/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: fullCode,
          type,
          signature,
          expiresAt,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Invalid code')
        return
      }
      onVerified({ email, code: fullCode, type, signature, expiresAt })
      onOpenChange(false)
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }, [code, email, type, signature, expiresAt, onVerified, onOpenChange])

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits are filled
    if (digit && index === 5 && newCode.every(d => d !== '')) {
      // Delay to let state update
      setTimeout(() => {
        const fullCode = newCode.join('')
        if (fullCode.length === 6) {
          verifyCodeSubmit()
        }
      }, 50)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') {
      verifyCodeSubmit()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      const newCode = [...code]
      for (let i = 0; i < pasted.length; i++) {
        newCode[i] = pasted[i]
      }
      setCode(newCode)
      if (pasted.length === 6) {
        setTimeout(() => verifyCodeSubmit(), 50)
      } else {
        inputRefs.current[Math.min(pasted.length, 5)]?.focus()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-ocean-500" />
            Verify Your Email
          </DialogTitle>
          <DialogDescription>
            {step === 'send'
              ? `We'll send a verification code to ${email}`
              : `Enter the 6-digit code sent to ${email}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 'send' && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <Mail className="h-5 w-5 text-gray-500 shrink-0" />
                <span className="text-sm font-medium text-gray-700 truncate">{email}</span>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <Button
                onClick={sendCode}
                disabled={sending}
                className="w-full"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <Input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-semibold"
                    autoComplete="off"
                  />
                ))}
              </div>

              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}

              <Button
                onClick={verifyCodeSubmit}
                disabled={verifying || code.some(d => d === '')}
                className="w-full"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>

              <button
                type="button"
                onClick={sendCode}
                disabled={sending}
                className="w-full text-sm text-ocean-600 hover:text-ocean-700 hover:underline disabled:opacity-50"
              >
                {sending ? 'Sending...' : "Didn't receive the code? Resend"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
