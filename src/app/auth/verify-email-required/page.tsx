'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Loader2, CheckCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VerifyEmailRequiredPage() {
  const { data: session } = useSession();
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    if (!session?.user?.email) return;
    setIsResending(true);
    setError('');

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.user.email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (data.alreadyVerified) {
        // Email is already verified, refresh the page to update session
        window.location.href = '/dashboard';
        return;
      }

      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Logo */}
          <Link href="/" className="inline-block mb-6">
            <span className="text-3xl font-bold bg-gradient-to-r from-ocean-500 to-tide-500 bg-clip-text text-transparent inline-flex items-center gap-2">
              <Image src="/logo.svg" alt="TimeTide" width={36} height={36} />
              TimeTide
            </span>
          </Link>

          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="h-8 w-8 text-amber-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Verify your email
          </h1>
          <p className="text-gray-600 mb-2">
            We sent a verification link to{' '}
            <strong>{session?.user?.email || 'your email'}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Please verify your email address to access your dashboard. Check your inbox and spam folder.
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
              {error}
            </div>
          )}

          {resent ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4 flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Verification email sent! Check your inbox.
            </div>
          ) : null}

          <div className="space-y-3">
            <Button
              className="w-full bg-gradient-to-r from-ocean-500 to-ocean-600 hover:from-ocean-600 hover:to-ocean-700"
              onClick={handleResend}
              disabled={isResending || resent}
            >
              {isResending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : resent ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Email sent
                </>
              ) : (
                'Resend verification email'
              )}
            </Button>

            <Button
              variant="ghost"
              className="w-full text-gray-500"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
