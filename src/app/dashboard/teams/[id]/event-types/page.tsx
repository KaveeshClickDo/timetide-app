'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, getInitials } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface TeamMember {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isActive: boolean;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  slug: string;
  members: TeamMember[];
}

interface EventTypeAssignment {
  id: string;
  teamMember: {
    id: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
  };
}

interface TeamEventType {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  length: number;
  locationType: string;
  schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED' | null;
  isActive: boolean;
  teamMemberAssignments: EventTypeAssignment[];
  _count: {
    bookings: number;
  };
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

const DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

export default function TeamEventTypesPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const teamId = params.id as string;

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newEventType, setNewEventType] = useState({
    title: '',
    slug: '',
    description: '',
    length: 30,
    locationType: 'GOOGLE_MEET',
    schedulingType: 'ROUND_ROBIN' as 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
    memberIds: [] as string[],
    // Booking window
    periodType: 'ROLLING' as 'ROLLING' | 'RANGE' | 'UNLIMITED',
    periodDays: 30,
    periodStartDate: format(new Date(), 'yyyy-MM-dd'),
    periodEndDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    // Advanced settings
    bufferTimeBefore: 0,
    bufferTimeAfter: 0,
    minimumNotice: 60,
    maxBookingsPerDay: 0,
    requiresConfirmation: false,
  });

  // Fetch team details
  const { data: teamData, isLoading: isTeamLoading } = useQuery<{ team: Team }>({
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

  // Create event type mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newEventType) => {
      const payload: Record<string, unknown> = {
        title: data.title,
        slug: data.slug,
        description: data.description || undefined,
        length: data.length,
        locationType: data.locationType,
        schedulingType: data.schedulingType,
        memberIds: data.memberIds,
        periodType: data.periodType,
        bufferTimeBefore: data.bufferTimeBefore,
        bufferTimeAfter: data.bufferTimeAfter,
        minimumNotice: data.minimumNotice,
        requiresConfirmation: data.requiresConfirmation,
      };

      if (data.periodType === 'ROLLING') {
        payload.periodDays = data.periodDays;
      } else if (data.periodType === 'RANGE') {
        payload.periodStartDate = new Date(data.periodStartDate).toISOString();
        payload.periodEndDate = new Date(data.periodEndDate).toISOString();
      }

      if (data.maxBookingsPerDay > 0) {
        payload.maxBookingsPerDay = data.maxBookingsPerDay;
      }

      const res = await fetch(`/api/teams/${teamId}/event-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create event type');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-event-types', teamId] });
      setIsCreateDialogOpen(false);
      setShowAdvanced(false);
      setNewEventType({
        title: '',
        slug: '',
        description: '',
        length: 30,
        locationType: 'GOOGLE_MEET',
        schedulingType: 'ROUND_ROBIN',
        memberIds: [],
        periodType: 'ROLLING',
        periodDays: 30,
        periodStartDate: format(new Date(), 'yyyy-MM-dd'),
        periodEndDate: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        bufferTimeBefore: 0,
        bufferTimeAfter: 0,
        minimumNotice: 60,
        maxBookingsPerDay: 0,
        requiresConfirmation: false,
      });
      toast({ title: 'Event type created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
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

  // Auto-generate slug from title
  const handleTitleChange = (title: string) => {
    setNewEventType({
      ...newEventType,
      title,
      slug: title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    });
  };

  const handleCreateEventType = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newEventType);
  };

  const toggleMemberSelection = (memberId: string) => {
    setNewEventType((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(memberId)
        ? prev.memberIds.filter((id) => id !== memberId)
        : [...prev.memberIds, memberId],
    }));
  };

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
  const eventTypes = eventTypesData?.eventTypes || [];
  const activeMembers = team.members.filter((m) => m.isActive);

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
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto flex-shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Create Event Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCreateEventType}>
              <DialogHeader>
                <DialogTitle>Create Team Event Type</DialogTitle>
                <DialogDescription>
                  Create a new event type for your team with round-robin or collective scheduling.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newEventType.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Team Consultation"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">/team/{team.slug}/</span>
                    <Input
                      id="slug"
                      value={newEventType.slug}
                      onChange={(e) => setNewEventType({ ...newEventType, slug: e.target.value })}
                      placeholder="team-consultation"
                      pattern="^[a-z0-9-]+$"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newEventType.description}
                    onChange={(e) => setNewEventType({ ...newEventType, description: e.target.value })}
                    placeholder="A brief description of this event type..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select
                    value={newEventType.length.toString()}
                    onValueChange={(v) => setNewEventType({ ...newEventType, length: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value.toString()}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Scheduling Type</Label>
                  <Select
                    value={newEventType.schedulingType}
                    onValueChange={(v) => setNewEventType({ ...newEventType, schedulingType: v as typeof newEventType.schedulingType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ROUND_ROBIN">
                        <div>
                          <div className="font-medium">Round Robin</div>
                          <div className="text-xs text-gray-500">Rotates between team members</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="COLLECTIVE">
                        <div>
                          <div className="font-medium">Collective</div>
                          <div className="text-xs text-gray-500">All members must be available</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="MANAGED">
                        <div>
                          <div className="font-medium">Managed</div>
                          <div className="text-xs text-gray-500">Admin assigns members manually</div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select
                    value={newEventType.locationType}
                    onValueChange={(v) => setNewEventType({ ...newEventType, locationType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GOOGLE_MEET">Google Meet</SelectItem>
                      <SelectItem value="TEAMS">Microsoft Teams</SelectItem>
                      <SelectItem value="ZOOM">Zoom</SelectItem>
                      <SelectItem value="PHONE">Phone Call</SelectItem>
                      <SelectItem value="IN_PERSON">In Person</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Booking Window */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Booking Window
                  </Label>
                  <div className="space-y-2">
                    {[
                      { value: 'ROLLING', label: 'Rolling Window', desc: 'Next X days from today' },
                      { value: 'RANGE', label: 'Date Range', desc: 'Specific date range' },
                      { value: 'UNLIMITED', label: 'Unlimited', desc: 'No date restrictions' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                          newEventType.periodType === option.value
                            ? 'border-ocean-500 bg-ocean-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <input
                          type="radio"
                          name="periodType"
                          value={option.value}
                          checked={newEventType.periodType === option.value}
                          onChange={() => setNewEventType({ ...newEventType, periodType: option.value as typeof newEventType.periodType })}
                          className="h-4 w-4 text-ocean-600 border-gray-300"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{option.label}</p>
                          <p className="text-xs text-gray-500">{option.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {newEventType.periodType === 'ROLLING' && (
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={newEventType.periodDays}
                        onChange={(e) => setNewEventType({
                          ...newEventType,
                          periodDays: Math.min(365, Math.max(1, parseInt(e.target.value) || 30)),
                        })}
                        className="w-20"
                      />
                      <span className="text-sm text-gray-500">days into the future</span>
                    </div>
                  )}

                  {newEventType.periodType === 'RANGE' && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Date</Label>
                        <Input
                          type="date"
                          value={newEventType.periodStartDate}
                          min={format(new Date(), 'yyyy-MM-dd')}
                          onChange={(e) => setNewEventType({ ...newEventType, periodStartDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End Date</Label>
                        <Input
                          type="date"
                          value={newEventType.periodEndDate}
                          min={newEventType.periodStartDate}
                          onChange={(e) => setNewEventType({ ...newEventType, periodEndDate: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {newEventType.periodType === 'UNLIMITED' && (
                    <p className="text-xs text-amber-600 pt-1">
                      Invitees can book any date in the future.
                    </p>
                  )}
                </div>

                {/* Requires Confirmation */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Require Confirmation</p>
                    <p className="text-xs text-gray-500">Bookings need manual approval</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={newEventType.requiresConfirmation}
                    onChange={(e) => setNewEventType({ ...newEventType, requiresConfirmation: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-ocean-600"
                  />
                </div>

                {/* Advanced Settings (collapsible) */}
                <div className="border rounded-lg">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-between w-full p-3 text-left"
                  >
                    <span className="text-sm font-medium text-gray-900">Advanced Settings</span>
                    {showAdvanced ? (
                      <ChevronUp className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                  {showAdvanced && (
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Buffer Before (min)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={120}
                            value={newEventType.bufferTimeBefore}
                            onChange={(e) => setNewEventType({ ...newEventType, bufferTimeBefore: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Buffer After (min)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={120}
                            value={newEventType.bufferTimeAfter}
                            onChange={(e) => setNewEventType({ ...newEventType, bufferTimeAfter: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Min Notice (min)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={newEventType.minimumNotice}
                            onChange={(e) => setNewEventType({ ...newEventType, minimumNotice: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Bookings/Day</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={newEventType.maxBookingsPerDay}
                            onChange={(e) => setNewEventType({ ...newEventType, maxBookingsPerDay: parseInt(e.target.value) || 0 })}
                          />
                          <p className="text-[10px] text-gray-500">0 = unlimited</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Assign Members</Label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select team members who will handle bookings for this event type
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {activeMembers.map((member) => (
                      <label
                        key={member.id}
                        className={cn(
                          'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                          newEventType.memberIds.includes(member.id)
                            ? 'bg-ocean-50 border border-ocean-200'
                            : 'hover:bg-gray-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={newEventType.memberIds.includes(member.id)}
                          onChange={() => toggleMemberSelection(member.id)}
                          className="h-4 w-4 rounded border-gray-300 text-ocean-600"
                        />
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.user.image || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(member.user.name || member.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {member.user.name || 'Unnamed'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {newEventType.memberIds.length === 0 && (
                    <p className="text-xs text-amber-600">
                      Select at least one member to handle bookings
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || newEventType.memberIds.length === 0}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Event Type'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Event Type
            </Button>
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
                            router.push(`/dashboard/event-types/${eventType.id}/edit`)
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
