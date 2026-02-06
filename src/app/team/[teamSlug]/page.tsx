'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users,
  Clock,
  Video,
  Phone,
  MapPin,
  Globe,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getInitials } from '@/lib/utils';

interface TeamMember {
  id: string;
  name: string | null;
  image: string | null;
}

interface EventType {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  length: number;
  locationType: string;
  schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED' | null;
  assignedMembers: TeamMember[];
}

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  memberCount: number;
  members: TeamMember[];
}

interface TeamData {
  team: Team;
  eventTypes: EventType[];
}

const LOCATION_ICONS: Record<string, any> = {
  GOOGLE_MEET: Video,
  TEAMS: Video,
  ZOOM: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
  CUSTOM: Globe,
};

const SCHEDULING_TYPE_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round Robin',
  COLLECTIVE: 'Collective',
  MANAGED: 'Managed',
};

export default function TeamPublicPage() {
  const params = useParams();
  const teamSlug = params?.teamSlug as string;

  const { data, isLoading, error } = useQuery<TeamData>({
    queryKey: ['public-team', teamSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/teams/${teamSlug}`);
      if (!res.ok) {
        throw new Error('Team not found');
      }
      return res.json();
    },
    enabled: !!teamSlug,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading team...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <Users className="h-10 w-10 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Team Not Found</h1>
          <p className="text-gray-500 mb-4">
            The team you&apos;re looking for doesn&apos;t exist or is no longer available.
          </p>
          <Link href="/" className="text-ocean-600 hover:text-ocean-700">
            Go to homepage
          </Link>
        </div>
      </div>
    );
  }

  const { team, eventTypes } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Team Header */}
        <div className="text-center mb-12">
          {team.logo ? (
            <Avatar className="h-24 w-24 mx-auto mb-6">
              <AvatarImage src={team.logo} />
              <AvatarFallback className="text-2xl">
                {getInitials(team.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-ocean-400 to-ocean-600 flex items-center justify-center mx-auto mb-6">
              <Users className="h-12 w-12 text-white" />
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{team.name}</h1>
          {team.description && (
            <p className="text-gray-600 max-w-xl mx-auto mb-4">{team.description}</p>
          )}

          {/* Team Members Preview */}
          {team.members.length > 0 && (
            <div className="flex items-center justify-center gap-2">
              <div className="flex -space-x-2">
                {team.members.slice(0, 5).map((member) => (
                  <Avatar key={member.id} className="h-8 w-8 border-2 border-white">
                    <AvatarImage src={member.image || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {team.memberCount > 5 && (
                  <div className="h-8 w-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-600">
                    +{team.memberCount - 5}
                  </div>
                )}
              </div>
              <span className="text-sm text-gray-500">
                {team.memberCount} team member{team.memberCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Event Types */}
        {eventTypes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Events Available
            </h2>
            <p className="text-gray-500">
              This team hasn&apos;t created any bookable events yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Book a Time
            </h2>
            {eventTypes.map((eventType) => {
              const LocationIcon = LOCATION_ICONS[eventType.locationType] || Globe;
              return (
                <Link
                  key={eventType.id}
                  href={`/team/${team.slug}/${eventType.slug}`}
                  className="block bg-white rounded-xl shadow-sm border p-6 hover:shadow-md hover:border-ocean-200 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-ocean-600 transition-colors">
                          {eventType.title}
                        </h3>
                        {eventType.schedulingType && (
                          <Badge variant="secondary" className="text-xs">
                            {SCHEDULING_TYPE_LABELS[eventType.schedulingType]}
                          </Badge>
                        )}
                      </div>
                      {eventType.description && (
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                          {eventType.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {eventType.length} min
                        </div>
                        <div className="flex items-center gap-1.5">
                          <LocationIcon className="h-4 w-4" />
                          {eventType.locationType.replace('_', ' ')}
                        </div>
                      </div>

                      {/* Assigned Members */}
                      {eventType.assignedMembers.length > 0 && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                          <div className="flex -space-x-1.5">
                            {eventType.assignedMembers.slice(0, 4).map((member) => (
                              <Avatar
                                key={member.id}
                                className="h-6 w-6 border-2 border-white"
                              >
                                <AvatarImage src={member.image || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(member.name || 'U')}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <span className="text-xs text-gray-500">
                            {eventType.assignedMembers.length} host
                            {eventType.assignedMembers.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-ocean-50 flex items-center justify-center group-hover:bg-ocean-100 transition-colors">
                        <ArrowRight className="h-5 w-5 text-ocean-600" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t">
          <p className="text-sm text-gray-400">
            Powered by{' '}
            <Link href="/" className="text-ocean-500 hover:text-ocean-600">
              TimeTide
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
