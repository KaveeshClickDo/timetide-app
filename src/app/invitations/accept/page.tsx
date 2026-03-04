'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Users, LogIn, UserPlus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface InvitationInfo {
  teamName: string;
  inviterName: string;
  role: string;
  status: string;
  expired: boolean;
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const token = searchParams.get('token');

  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [acceptStatus, setAcceptStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [acceptMessage, setAcceptMessage] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);

  // Fetch invitation info (no auth required)
  useEffect(() => {
    if (!token) {
      setInvitationError('No invitation token provided');
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/invitations/info?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          setInvitationError(data.error || 'Invalid invitation');
          return;
        }

        setInvitationInfo(data);
      } catch {
        setInvitationError('Failed to load invitation details');
      }
    };

    fetchInfo();
  }, [token]);

  // Auto-accept when authenticated
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !token || !invitationInfo || acceptStatus !== 'idle') return;
    if (invitationInfo.status !== 'PENDING' || invitationInfo.expired) return;

    const acceptInvitation = async () => {
      setAcceptStatus('loading');
      try {
        const res = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setAcceptStatus('error');
          setAcceptMessage(data.error || 'Failed to accept invitation');
          return;
        }

        setAcceptStatus('success');
        setTeamId(data.team.id);
        setAcceptMessage(data.message || `You've joined ${data.team.name}!`);
      } catch {
        setAcceptStatus('error');
        setAcceptMessage('Something went wrong. Please try again.');
      }
    };

    acceptInvitation();
  }, [sessionStatus, token, invitationInfo, acceptStatus]);

  const callbackUrl = `/invitations/accept?token=${encodeURIComponent(token || '')}`;

  // Loading state (session or invitation info loading)
  if (sessionStatus === 'loading' || (!invitationInfo && !invitationError)) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
          </div>
          <CardTitle className="text-xl">Loading Invitation...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // Invalid/missing token or fetch error
  if (invitationError) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl">Invitation Error</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">{invitationError}</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Invitation expired or not pending
  if (invitationInfo && (invitationInfo.expired || invitationInfo.status !== 'PENDING') && acceptStatus === 'idle') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl">Invitation Unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            {invitationInfo.expired
              ? 'This invitation has expired. Please ask the team admin to send a new one.'
              : `This invitation has already been ${invitationInfo.status.toLowerCase()}.`}
          </p>
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Not authenticated — show invitation details with sign-in/sign-up options
  if (sessionStatus === 'unauthenticated' && invitationInfo) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-ocean-600" />
          </div>
          <CardTitle className="text-xl">You&apos;re Invited!</CardTitle>
          <CardDescription>
            {invitationInfo.inviterName} invited you to join
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-ocean-50 rounded-lg p-4 text-center space-y-2">
            <p className="text-lg font-semibold text-ocean-900">{invitationInfo.teamName}</p>
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" />
              {invitationInfo.role}
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-500 text-center">
              Sign in to your account to accept this invitation
            </p>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="block">
              <Button className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In to Accept
              </Button>
            </Link>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">
                  or
                </span>
              </div>
            </div>
            <Link href={`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="block">
              <Button variant="outline" className="w-full">
                <UserPlus className="h-4 w-4 mr-2" />
                Create an Account
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Authenticated — accepting in progress
  if (acceptStatus === 'loading') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
          </div>
          <CardTitle className="text-xl">Accepting Invitation...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // Accept success
  if (acceptStatus === 'success') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-xl">Welcome to the Team!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">{acceptMessage}</p>
          {teamId && (
            <div className="space-y-2">
              <Button onClick={() => router.push(`/dashboard/teams/${teamId}`)} className="w-full">
                <Users className="h-4 w-4 mr-2" />
                Go to {invitationInfo?.teamName}
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Accept error
  if (acceptStatus === 'error') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl">Could Not Accept Invitation</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">{acceptMessage}</p>
          <div className="space-y-2">
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="h-16 w-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto">
                <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
              </div>
              <CardTitle className="text-xl">Loading...</CardTitle>
            </CardHeader>
          </Card>
        }
      >
        <AcceptInvitationContent />
      </Suspense>
    </div>
  );
}
