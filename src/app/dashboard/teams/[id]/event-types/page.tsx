'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  MoreVertical,
  Trash2,
  Copy,
  ExternalLink,
  Video,
  Phone,
  MapPin,
  Globe,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { getInitials } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { EmbedCodeGenerator } from '@/components/booking/embed-code-generator';
import type { TeamMemberWithRole } from '@/types/team';
import type { TeamEventType, EventTypeAssignment } from '@/types/event-type';

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

export default function TeamEventTypesPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const teamId = params.id as string;

  // Fetch team details
  const { data: teamData, isLoading: isTeamLoading } = useQuery<{ team: { id: string; name: string; slug: string; members: TeamMemberWithRole[] }; ownerPlanActive: boolean }>({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}`);
      if (!res.ok) throw new Error('Failed to fetch team');
      return res.json();
    },
  });

  // Fetch team event types
  const { data: eventTypesData, isLoading: isEventTypesLoading } = useQuery<{ eventTypes: TeamEventType[] }>({
    queryKey: ['team-event-types', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}/event-types`);
      if (!res.ok) throw new Error('Failed to fetch event types');
      return res.json();
    },
    enabled: !!teamId,
  });

  // Delete event type mutation
  const deleteMutation = useMutation({
    mutationFn: async (eventTypeId: string) => {
      const res = await fetch(`/api/teams/${teamId}/event-types/${eventTypeId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete event type');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-event-types', teamId] });
      toast({ title: 'Event type deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const copyBookingUrl = (eventSlug: string) => {
    const url = `${window.location.origin}/team/${teamData?.team.slug}/${eventSlug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'URL copied to clipboard' });
  };

  const isLoading = isTeamLoading || isEventTypesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    );
  }

  if (!teamData?.team) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-red-600">Failed to load team. Please try again.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/teams')}>
          Back to Teams
        </Button>
      </div>
    );
  }

  const team = teamData.team;
  const ownerPlanActive = teamData.ownerPlanActive;
  const eventTypes = eventTypesData?.eventTypes || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => router.push(`/dashboard/teams/${teamId}`)}
      >
        <ChevronLeft className="h-4 w-4 mr-2" />
        Back to {team.name}
      </Button>

      {/* Owner plan inactive banner */}
      {ownerPlanActive === false && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 mb-6">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Team features are restricted</p>
            <p className="text-sm text-yellow-700 mt-0.5">
              The team owner&apos;s plan no longer includes team features. New team event types cannot be created and member invitations are disabled. The owner must upgrade to a TEAM plan to restore full access.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900">
            Team Event Types
          </h1>
          <p className="text-gray-600 mt-1">
            Manage event types for {team.name}
          </p>
        </div>
        {ownerPlanActive === false ? (
          <Button className="w-full sm:w-auto flex-shrink-0" disabled title="Owner's plan does not include team features">
            <Plus className="h-4 w-4 mr-2" />
            Create Event Type
          </Button>
        ) : (
          <Link href={`/dashboard/teams/${teamId}/event-types/new`}>
            <Button className="w-full sm:w-auto flex-shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Create Event Type
            </Button>
          </Link>
        )}
      </div>

      {/* Event Types List */}
      {eventTypes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-6">
              <Calendar className="h-10 w-10 text-ocean-500" />
            </div>
            <h2 className="text-2xl font-heading font-bold text-gray-900 mb-3">
              No Event Types Yet
            </h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              Create your first team event type to start accepting bookings with round-robin
              or collective scheduling.
            </p>
            <Link href={`/dashboard/teams/${teamId}/event-types/new`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create First Event Type
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {eventTypes.map((eventType) => {
            const LocationIcon = LOCATION_ICONS[eventType.locationType] || Globe;
            return (
              <Card key={eventType.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {eventType.title}
                        </h3>
                        {!eventType.isActive && (
                          <Badge variant="outline" className="text-gray-500">
                            Inactive
                          </Badge>
                        )}
                        {eventType.schedulingType && (
                          <Badge variant="secondary">
                            {SCHEDULING_TYPE_LABELS[eventType.schedulingType]}
                          </Badge>
                        )}
                        {(eventType as any).allowsRecurring && (
                          <Badge variant="outline" className="text-purple-600 border-purple-200">
                            Recurring
                          </Badge>
                        )}
                        {(eventType as any).seatsPerSlot > 1 && (
                          <Badge variant="outline" className="text-blue-600 border-blue-200">
                            Group ({(eventType as any).seatsPerSlot} seats)
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mb-4">
                        /team/{team.slug}/{eventType.slug}
                      </p>
                      {eventType.description && (
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                          {eventType.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {eventType.length} min
                        </div>
                        <div className="flex items-center gap-2">
                          <LocationIcon className="h-4 w-4" />
                          {eventType.locationType.replace('_', ' ')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {eventType._count.bookings} bookings
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-4">
                        <EmbedCodeGenerator
                          username=""
                          eventSlug={eventType.slug}
                          eventTitle={eventType.title}
                          basePath={`/team/${team.slug}`}
                        />
                      </div>

                      {/* Assigned Members */}
                      {eventType.teamMemberAssignments.length > 0 && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                          <Users className="h-4 w-4 text-gray-400" />
                          <div className="flex -space-x-2">
                            {eventType.teamMemberAssignments.slice(0, 5).map((assignment) => (
                              <Avatar
                                key={assignment.id}
                                className="h-7 w-7 border-2 border-white"
                              >
                                <AvatarImage src={assignment.teamMember.user.image || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(
                                    assignment.teamMember.user.name ||
                                      assignment.teamMember.user.email
                                  )}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {eventType.teamMemberAssignments.length > 5 && (
                              <div className="h-7 w-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-600">
                                +{eventType.teamMemberAssignments.length - 5}
                              </div>
                            )}
                          </div>
                          <span className="text-sm text-gray-500">
                            {eventType.teamMemberAssignments.length} assigned
                          </span>
                        </div>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyBookingUrl(eventType.slug)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            window.open(`/team/${team.slug}/${eventType.slug}`, '_blank')
                          }
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Public Page
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/dashboard/teams/${teamId}/event-types/${eventType.id}/edit`)
                          }
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this event type?')) {
                              deleteMutation.mutate(eventType.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
