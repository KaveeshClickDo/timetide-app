'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No invitation token provided');
      return;
    }

    const acceptInvitation = async () => {
      try {
        const res = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Failed to accept invitation');
          return;
        }

        setStatus('success');
        setTeamId(data.team.id);
        setTeamName(data.team.name);
        setMessage(data.message || `You've joined ${data.team.name}!`);
      } catch {
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
      }
    };

    acceptInvitation();
  }, [token]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4">
          {status === 'loading' && (
            <div className="h-16 w-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto">
              <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
            </div>
          )}
          {status === 'success' && (
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          )}
          {status === 'error' && (
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          )}
        </div>
        <CardTitle className="text-xl">
          {status === 'loading' && 'Accepting Invitation...'}
          {status === 'success' && 'Welcome to the Team!'}
          {status === 'error' && 'Invitation Error'}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-gray-600">{message}</p>

        {status === 'success' && teamId && (
          <div className="space-y-2">
            <Button onClick={() => router.push(`/dashboard/teams/${teamId}`)} className="w-full">
              <Users className="h-4 w-4 mr-2" />
              Go to {teamName}
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
              Go to Dashboard
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-2">
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
              Go to Dashboard
            </Button>
            <Button variant="ghost" onClick={() => router.push('/auth/signin')} className="w-full">
              Sign In
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
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
