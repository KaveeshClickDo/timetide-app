'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import {
  Users,
  Plus,
  Settings,
  Loader2,
  MoreVertical,
  Trash2,
  ChevronLeft,
  UserPlus,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Copy,
  ExternalLink,
  Activity,
  Upload,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, getInitials } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface TeamMember {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isActive: boolean;
  priority: number;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  _count?: {
    assignments: number;
  };
}

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  members: TeamMember[];
  _count: {
    eventTypes: number;
  };
}

interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

const auditActionLabels: Record<string, string> = {
  'team.updated': 'Updated team settings',
  'team.logo_updated': 'Updated team logo',
  'team.logo_removed': 'Removed team logo',
  'member.added': 'Added a member',
  'member.removed': 'Removed a member',
  'member.role_changed': 'Changed member role',
  'member.status_changed': 'Changed member status',
  'member.updated': 'Updated member',
  'invitation.sent': 'Sent an invitation',
  'invitation.cancelled': 'Cancelled an invitation',
  'invitation.accepted': 'Accepted an invitation',
  'bulk.role_changed': 'Bulk changed member roles',
  'bulk.removed': 'Bulk removed members',
  'bulk.activated': 'Bulk activated members',
  'bulk.deactivated': 'Bulk deactivated members',
};

const roleLabels = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

const roleIcons = {
  OWNER: ShieldCheck,
  ADMIN: Shield,
  MEMBER: User,
};

interface TeamInvitation {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: string;
  expiresAt: string;
  createdAt: string;
  inviter: { id: string; name: string | null; email: string } | null;
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const teamId = params.id as string;

  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [editTeam, setEditTeam] = useState({
    name: '',
    slug: '',
    description: '',
  });

  // Fetch team details
  const { data, isLoading, error } = useQuery<{ team: Team; currentUserRole: string }>({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}`);
      if (!res.ok) throw new Error('Failed to fetch team');
      return res.json();
    },
  });

  // Fetch team members with details
  const { data: membersData } = useQuery<{ members: TeamMember[] }>({
    queryKey: ['team-members', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}/members`);
      if (!res.ok) throw new Error('Failed to fetch members');
      return res.json();
    },
    enabled: !!teamId,
  });

  // Fetch audit log
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [allAuditLogs, setAllAuditLogs] = useState<AuditLogEntry[]>([]);
  const { data: auditData, isLoading: isAuditLoading } = useQuery<{
    logs: AuditLogEntry[];
    nextCursor: string | null;
  }>({
    queryKey: ['team-audit', teamId, auditCursor],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (auditCursor) params.set('cursor', auditCursor);
      const res = await fetch(`/api/teams/${teamId}/audit-log?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      return res.json();
    },
    enabled: !!teamId && (data?.currentUserRole === 'OWNER' || data?.currentUserRole === 'ADMIN'),
  });

  const loadMoreAudit = useCallback(() => {
    if (auditData?.nextCursor) {
      setAllAuditLogs((prev) => [...prev, ...(auditData.logs || [])]);
      setAuditCursor(auditData.nextCursor);
    }
  }, [auditData]);

  const displayedAuditLogs = [
    ...allAuditLogs,
    ...(auditData?.logs || []),
  ];

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null);
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/teams/${teamId}/logo`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload logo');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      toast({ title: 'Logo updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/teams/${teamId}/logo`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove logo');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      toast({ title: 'Logo removed' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large. Maximum size is 2MB', variant: 'destructive' });
      return;
    }
    uploadLogoMutation.mutate(file);
    e.target.value = '';
  };

  // Fetch invitations
  const { data: invitationsData } = useQuery<{ invitations: TeamInvitation[] }>({
    queryKey: ['team-invitations', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}/invitations`);
      if (!res.ok) throw new Error('Failed to fetch invitations');
      return res.json();
    },
    enabled: !!teamId && (data?.currentUserRole === 'OWNER' || data?.currentUserRole === 'ADMIN'),
  });

  // Send invitation mutation
  const sendInviteMutation = useMutation({
    mutationFn: async (invData: { email: string; role: string }) => {
      const res = await fetch(`/api/teams/${teamId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send invitation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations', teamId] });
      setIsInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
      toast({ title: 'Invitation sent successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Cancel invitation mutation
  const cancelInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(`/api/teams/${teamId}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to cancel invitation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations', teamId] });
      toast({ title: 'Invitation cancelled' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Bulk member action mutation
  const bulkActionMutation = useMutation({
    mutationFn: async (actionData: { action: string; memberIds: string[]; role?: string }) => {
      const res = await fetch(`/api/teams/${teamId}/members/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to perform bulk action');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      setSelectedMembers(new Set());
      toast({ title: `${data.affected} member(s) updated` });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const toggleMemberSelect = (memberId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      setIsAddMemberDialogOpen(false);
      setNewMemberEmail('');
      setNewMemberRole('MEMBER');
      toast({ title: 'Member added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Update team mutation
  const updateTeamMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; description?: string }) => {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update team');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      setIsEditDialogOpen(false);
      toast({ title: 'Team updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Update member role mutation
  const updateMemberMutation = useMutation({
    mutationFn: async ({ memberId, data }: { memberId: string; data: { role?: string; isActive?: boolean } }) => {
      const res = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      toast({ title: 'Member updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to remove member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      toast({ title: 'Member removed successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    addMemberMutation.mutate({ email: newMemberEmail, role: newMemberRole });
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    sendInviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleUpdateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    updateTeamMutation.mutate({
      name: editTeam.name,
      slug: editTeam.slug,
      description: editTeam.description || undefined,
    });
  };

  const openEditDialog = () => {
    if (data?.team) {
      setEditTeam({
        name: data.team.name,
        slug: data.team.slug,
        description: data.team.description || '',
      });
      setIsEditDialogOpen(true);
    }
  };

  const copyBookingUrl = () => {
    const url = `${window.location.origin}/team/${data?.team.slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'URL copied to clipboard' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    );
  }

  if (error || !data?.team) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-red-600">Failed to load team. Please try again.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/teams')}>
          Back to Teams
        </Button>
      </div>
    );
  }

  const team = data.team;
  const members = membersData?.members || team.members;
  const selectableMembers = members.filter((m) => m.role !== 'OWNER');
  const toggleSelectAll = () => {
    if (selectedMembers.size === selectableMembers.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(selectableMembers.map((m) => m.id)));
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => router.push('/dashboard/teams')}
      >
        <ChevronLeft className="h-4 w-4 mr-2" />
        Back to Teams
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          {team.logo ? (
            <Avatar className="h-16 w-16">
              <AvatarImage src={team.logo} />
              <AvatarFallback>{getInitials(team.name)}</AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-16 w-16 rounded-full bg-ocean-100 flex items-center justify-center">
              <Users className="h-8 w-8 text-ocean-600" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-heading font-bold text-gray-900">{team.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500">/team/{team.slug}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyBookingUrl}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open(`/team/${team.slug}`, '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Page
          </Button>
          <Button variant="outline" onClick={openEditDialog}>
            <Settings className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {team.description && (
        <p className="text-gray-600 mb-8">{team.description}</p>
      )}

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {(data?.currentUserRole === 'OWNER' || data?.currentUserRole === 'ADMIN') && (
            <TabsTrigger value="activity">Activity</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>Manage who has access to this team</CardDescription>
              </div>
              <div className="flex gap-2">
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Mail className="h-4 w-4 mr-2" />
                      Invite
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleSendInvite}>
                      <DialogHeader>
                        <DialogTitle>Invite to Team</DialogTitle>
                        <DialogDescription>
                          Send an email invitation. They&apos;ll receive a link to join.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="invite-email">Email Address</Label>
                          <Input
                            id="invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="invite-role">Role</Label>
                          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MEMBER">Member</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                              <SelectItem value="OWNER">Owner</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={sendInviteMutation.isPending}>
                          {sendInviteMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send Invitation'
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleAddMember}>
                    <DialogHeader>
                      <DialogTitle>Add Team Member</DialogTitle>
                      <DialogDescription>
                        Invite a user by their email address.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newMemberEmail}
                          onChange={(e) => setNewMemberEmail(e.target.value)}
                          placeholder="colleague@company.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as typeof newMemberRole)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="OWNER">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                          Admins can manage members and event types. Owners have full control.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddMemberDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={addMemberMutation.isPending}>
                        {addMemberMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          'Add Member'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Bulk Action Bar */}
              {selectedMembers.size > 0 && (
                <div className="flex items-center gap-3 p-3 mb-4 bg-ocean-50 rounded-lg border border-ocean-200">
                  <span className="text-sm font-medium text-ocean-700">
                    {selectedMembers.size} selected
                  </span>
                  <div className="flex gap-2 ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">Change Role</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => bulkActionMutation.mutate({
                          action: 'change_role',
                          memberIds: Array.from(selectedMembers),
                          role: 'ADMIN',
                        })}>
                          <Shield className="h-4 w-4 mr-2" /> Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => bulkActionMutation.mutate({
                          action: 'change_role',
                          memberIds: Array.from(selectedMembers),
                          role: 'MEMBER',
                        })}>
                          <User className="h-4 w-4 mr-2" /> Make Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bulkActionMutation.mutate({
                        action: 'activate',
                        memberIds: Array.from(selectedMembers),
                      })}
                    >
                      Activate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bulkActionMutation.mutate({
                        action: 'deactivate',
                        memberIds: Array.from(selectedMembers),
                      })}
                    >
                      Deactivate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remove ${selectedMembers.size} member(s)?`)) {
                          bulkActionMutation.mutate({
                            action: 'remove',
                            memberIds: Array.from(selectedMembers),
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Remove
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedMembers(new Set())}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}
              {/* Select All */}
              {selectableMembers.length > 1 && (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-ocean-600 focus:ring-ocean-500"
                    checked={selectedMembers.size === selectableMembers.length && selectableMembers.length > 0}
                    onChange={toggleSelectAll}
                  />
                  <span className="text-sm text-gray-500">Select all non-owner members</span>
                </div>
              )}
              <div className="space-y-4">
                {members.map((member) => {
                  const RoleIcon = roleIcons[member.role];
                  const isSelectable = member.role !== 'OWNER';
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border",
                        selectedMembers.has(member.id) && "border-ocean-300 bg-ocean-50/50"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        {isSelectable ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-ocean-600 focus:ring-ocean-500"
                            checked={selectedMembers.has(member.id)}
                            onChange={() => toggleMemberSelect(member.id)}
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.user.image || undefined} />
                          <AvatarFallback>
                            {getInitials(member.user.name || member.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {member.user.name || 'Unnamed User'}
                            </span>
                            <Badge variant={member.role === 'OWNER' ? 'default' : member.role === 'ADMIN' ? 'secondary' : 'outline'}>
                              <RoleIcon className="h-3 w-3 mr-1" />
                              {roleLabels[member.role]}
                            </Badge>
                            {!member.isActive && (
                              <Badge variant="outline" className="text-orange-600 border-orange-200">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{member.user.email}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => updateMemberMutation.mutate({
                              memberId: member.id,
                              data: { role: 'ADMIN' },
                            })}
                            disabled={member.role === 'ADMIN'}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            Make Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateMemberMutation.mutate({
                              memberId: member.id,
                              data: { role: 'MEMBER' },
                            })}
                            disabled={member.role === 'MEMBER'}
                          >
                            <User className="h-4 w-4 mr-2" />
                            Make Member
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateMemberMutation.mutate({
                              memberId: member.id,
                              data: { isActive: !member.isActive },
                            })}
                          >
                            {member.isActive ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              if (confirm('Are you sure you want to remove this member?')) {
                                removeMemberMutation.mutate(member.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          {invitationsData && invitationsData.invitations.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Pending Invitations ({invitationsData.invitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invitationsData.invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-dashed"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">{invitation.email}</span>
                          <Badge variant="outline">{roleLabels[invitation.role]}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Invited {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
                          {invitation.inviter && ` by ${invitation.inviter.name || invitation.inviter.email}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm('Cancel this invitation?')) {
                            cancelInviteMutation.mutate(invitation.id);
                          }
                        }}
                        disabled={cancelInviteMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Settings</CardTitle>
              <CardDescription>Update your team&apos;s information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Team Logo</h4>
                  <div className="flex items-center gap-4">
                    {team.logo ? (
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={team.logo} />
                        <AvatarFallback>{getInitials(team.name)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-ocean-100 flex items-center justify-center">
                        <Users className="h-10 w-10 text-ocean-600" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadLogoMutation.isPending}
                      >
                        {uploadLogoMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {team.logo ? 'Change Logo' : 'Upload Logo'}
                      </Button>
                      {team.logo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => removeLogoMutation.mutate()}
                          disabled={removeLogoMutation.isPending}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Remove
                        </Button>
                      )}
                      <p className="text-xs text-gray-500">JPEG, PNG, WebP, or GIF. Max 2MB.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium text-gray-900 mb-2">Public Booking URL</h4>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/team/{team.slug}
                    </code>
                    <Button variant="outline" onClick={copyBookingUrl}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="pt-6 border-t">
                  <h4 className="font-medium text-gray-900 mb-4">Danger Zone</h4>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
                        // Delete team
                        fetch(`/api/teams/${teamId}`, { method: 'DELETE' })
                          .then(() => {
                            toast({ title: 'Team deleted' });
                            router.push('/dashboard/teams');
                          })
                          .catch(() => toast({ title: 'Failed to delete team', variant: 'destructive' }));
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Team
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {(data?.currentUserRole === 'OWNER' || data?.currentUserRole === 'ADMIN') && (
          <TabsContent value="activity" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Team Activity
                </CardTitle>
                <CardDescription>Recent actions and changes in this team</CardDescription>
              </CardHeader>
              <CardContent>
                {isAuditLoading && displayedAuditLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-ocean-500" />
                  </div>
                ) : displayedAuditLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p>No activity yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {displayedAuditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 py-3 border-b last:border-b-0"
                      >
                        <Avatar className="h-8 w-8 mt-0.5">
                          <AvatarImage src={log.user.image || undefined} />
                          <AvatarFallback className="text-xs">
                            {getInitials(log.user.name || log.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className="font-medium text-gray-900">
                              {log.user.name || log.user.email}
                            </span>{' '}
                            <span className="text-gray-600">
                              {auditActionLabels[log.action] || log.action}
                            </span>
                            {log.changes && typeof log.changes === 'object' && 'email' in log.changes && (
                              <span className="text-gray-500">
                                {' '}({String(log.changes.email)})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {auditData?.nextCursor && (
                      <div className="pt-4 text-center">
                        <Button variant="outline" size="sm" onClick={loadMoreAudit}>
                          Load More
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Team Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <form onSubmit={handleUpdateTeam}>
            <DialogHeader>
              <DialogTitle>Edit Team</DialogTitle>
              <DialogDescription>Update your team&apos;s information</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Team Name</Label>
                <Input
                  id="edit-name"
                  value={editTeam.name}
                  onChange={(e) => setEditTeam({ ...editTeam, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-slug">URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">/team/</span>
                  <Input
                    id="edit-slug"
                    value={editTeam.slug}
                    onChange={(e) => setEditTeam({ ...editTeam, slug: e.target.value })}
                    pattern="^[a-z0-9-]+$"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editTeam.description}
                  onChange={(e) => setEditTeam({ ...editTeam, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateTeamMutation.isPending}>
                {updateTeamMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
