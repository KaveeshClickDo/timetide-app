'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import BookingWidget from '@/components/booking/booking-widget';
import Link from 'next/link';
import type { TeamPublic, TeamMemberBooking } from '@/types/team';
import type { EventTypeDetail } from '@/types/event-type';

interface TeamEventTypeData {
  team: TeamPublic;
  eventType: EventTypeDetail;
  members: TeamMemberBooking[];
  defaultTimezone: string;
}

export default function TeamBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamSlug = params?.teamSlug as string;
  const eventSlug = params?.eventSlug as string;
  const isEmbed = searchParams.get('embed') === 'true';

  // Fetch team event type data
  const { data, isLoading, error } = useQuery<TeamEventTypeData>({
    queryKey: ['team-event-type', teamSlug, eventSlug],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/team-event-types?teamSlug=${teamSlug}&slug=${eventSlug}`
      );
      if (!res.ok) {
        throw new Error('Event type not found');
      }
      return res.json();
    },
    enabled: !!teamSlug && !!eventSlug,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className={isEmbed ? 'flex items-center justify-center h-full' : 'min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center'}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading event details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className={isEmbed ? 'flex items-center justify-center h-full' : 'min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center'}>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Not Found</h1>
          <p className="text-gray-500 mb-4">
            The event you&apos;re looking for doesn&apos;t exist or is no longer available.
          </p>
          {!isEmbed && (
            <Link href="/" className="text-ocean-600 hover:text-ocean-700">
              Go to homepage
            </Link>
          )}
        </div>
      </div>
    );
  }

  const { team, eventType, members, defaultTimezone } = data;

  return (
    <div className={isEmbed ? '' : 'min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50'}>
      <BookingWidget
        variant="team"
        team={{
          id: team.id,
          name: team.name,
          slug: team.slug,
          logo: team.logo,
        }}
        eventType={{
          id: eventType.id,
          slug: eventSlug,
          title: eventType.title,
          description: eventType.description,
          length: eventType.length,
          locationType: eventType.locationType,
          seatsPerSlot: eventType.seatsPerSlot ?? 1,
          schedulingType: eventType.schedulingType ?? null,
          questions:
            eventType.questions?.map((q) => ({
              id: q.id,
              type: q.type,
              label: q.label,
              required: q.required,
              placeholder: q.placeholder ?? undefined,
              options: q.options ?? undefined,
            })) ?? [],
        }}
        members={members}
        defaultTimezone={defaultTimezone}
        isEmbed={isEmbed}
      />
    </div>
  );
}
