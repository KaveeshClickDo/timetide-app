'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

type VerificationState = 'loading' | 'success' | 'already_verified' | 'error';

export default function VerifyEmailPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [state, setState] = useState<VerificationState>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        if (data.alreadyVerified) {
          setState('already_verified');
        } else {
          setState('success');
        }

        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      } catch (err) {
        setState('error');
        setError(err instanceof Error ? err.message : 'Verification failed');
      }
    };

    if (token) {
      verifyEmail();
    }
  }, [token, router]);

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

          {/* Loading State */}
          {state === 'loading' && (
            <>
              <div className="w-16 h-16 bg-ocean-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Loader2 className="h-8 w-8 text-ocean-600 animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verifying your email...
              </h1>
              <p className="text-gray-600">
                Please wait while we verify your email address.
              </p>
            </>
          )}

          {/* Success State */}
          {state === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Email verified!
              </h1>
              <p className="text-gray-600 mb-6">
                Your email has been verified successfully. Redirecting to dashboard...
              </p>
              <Link href="/dashboard">
                <Button className="w-full bg-gradient-to-r from-ocean-500 to-ocean-600">
                  Go to Dashboard
                </Button>
              </Link>
            </>
          )}

          {/* Already Verified State */}
          {state === 'already_verified' && (
            <>
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Already verified
              </h1>
              <p className="text-gray-600 mb-6">
                Your email is already verified. Redirecting to dashboard...
              </p>
              <Link href="/dashboard">
                <Button className="w-full bg-gradient-to-r from-ocean-500 to-ocean-600">
                  Go to Dashboard
                </Button>
              </Link>
            </>
          )}

          {/* Error State */}
          {state === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verification failed
              </h1>
              <p className="text-gray-600 mb-2">{error}</p>
              <p className="text-sm text-gray-500 mb-6">
                The verification link may have expired or already been used.
              </p>
              <div className="space-y-3">
                <Link href="/auth/signin">
                  <Button className="w-full bg-gradient-to-r from-ocean-500 to-ocean-600">
                    Sign in
                  </Button>
                </Link>
                <Link href="/auth/resend-verification">
                  <Button variant="outline" className="w-full">
                    Resend verification email
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
