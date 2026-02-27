'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Webhook,
  Plus,
  Settings,
  Loader2,
  MoreVertical,
  Trash2,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Copy,
  AlertTriangle,
  Pencil,
  History,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { FeatureGatePage } from '@/components/feature-gate-page';
import { UpgradeModal } from '@/components/upgrade-modal';

interface WebhookDelivery {
  id: string;
  eventType: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';
  attempts: number;
  responseStatus: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface WebhookData {
  id: string;
  name: string | null;
  url: string;
  secret?: string;
  eventTriggers: string[];
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  totalDeliveries: number;
  recentStats: {
    success: number;
    failed: number;
  };
}

const EVENT_OPTIONS = [
  { value: 'booking.created', label: 'Booking Created', description: 'When a new booking is made' },
  { value: 'booking.cancelled', label: 'Booking Cancelled', description: 'When a booking is cancelled' },
  { value: 'booking.rescheduled', label: 'Booking Rescheduled', description: 'When a booking time is changed' },
  { value: 'booking.confirmed', label: 'Booking Confirmed', description: 'When host confirms a pending booking' },
  { value: 'booking.rejected', label: 'Booking Rejected', description: 'When host rejects a pending booking' },
];

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookData | null>(null);
  const [editingWebhook, setEditingWebhook] = useState<{
    id: string;
    name: string;
    url: string;
    eventTriggers: string[];
  } | null>(null);
  const [deliveryWebhookId, setDeliveryWebhookId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    url: '',
    eventTriggers: [] as string[],
  });

  // Fetch webhooks
  const { data, isLoading, error } = useQuery<{ webhooks: WebhookData[] }>({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/webhooks');
      if (!res.ok) throw new Error('Failed to fetch webhooks');
      return res.json();
    },
  });

  // Create webhook mutation
  const createMutation = useMutation({
    mutationFn: async (webhookData: { name: string; url: string; eventTriggers: string[] }) => {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create webhook');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setIsCreateDialogOpen(false);
      setNewWebhook({ name: '', url: '', eventTriggers: [] });
      toast({ title: 'Webhook created successfully' });
      // Show the secret to the user
      if (data.webhook.secret) {
        setSelectedWebhook(data.webhook);
        setShowSecrets({ [data.webhook.id]: true });
      }
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Delete webhook mutation
  const deleteMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const res = await fetch(`/api/webhooks/${webhookId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete webhook');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Webhook deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Toggle webhook active status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update webhook');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Test webhook mutation
  const testMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const res = await fetch(`/api/webhooks/${webhookId}/test`, {
        method: 'POST',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test webhook');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: `Test successful! Response time: ${data.responseTime}ms` });
      } else {
        toast({
          title: 'Test failed',
          description: data.error || `HTTP ${data.statusCode}`,
          variant: 'destructive'
        });
      }
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Update webhook mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string | null; url?: string; eventTriggers?: string[]; regenerateSecret?: boolean }) => {
      const { id, ...body } = data;
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update webhook');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setIsEditDialogOpen(false);
      setEditingWebhook(null);
      toast({ title: 'Webhook updated successfully' });
      if (data.webhook.secret) {
        setShowSecrets((prev) => ({ ...prev, [data.webhook.id]: true }));
      }
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Fetch webhook deliveries
  const { data: deliveryData, isLoading: isDeliveryLoading } = useQuery<{
    webhook: WebhookData & { deliveries: WebhookDelivery[]; stats: { success: number; failed: number; pending: number } };
  }>({
    queryKey: ['webhook-deliveries', deliveryWebhookId],
    queryFn: async () => {
      const res = await fetch(`/api/webhooks/${deliveryWebhookId}`);
      if (!res.ok) throw new Error('Failed to fetch deliveries');
      return res.json();
    },
    enabled: !!deliveryWebhookId && isDeliveryDialogOpen,
  });

  // Retry delivery mutation
  const retryMutation = useMutation({
    mutationFn: async ({ webhookId, deliveryId }: { webhookId: string; deliveryId: string }) => {
      const res = await fetch(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to retry delivery');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', deliveryWebhookId] });
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Retry queued successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const openEditDialog = useCallback((webhook: WebhookData) => {
    setEditingWebhook({
      id: webhook.id,
      name: webhook.name || '',
      url: webhook.url,
      eventTriggers: [...webhook.eventTriggers],
    });
    setIsEditDialogOpen(true);
  }, []);

  const openDeliveryDialog = useCallback((webhookId: string) => {
    setDeliveryWebhookId(webhookId);
    setIsDeliveryDialogOpen(true);
  }, []);

  const toggleEditEventTrigger = (event: string) => {
    if (!editingWebhook) return;
    setEditingWebhook((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        eventTriggers: prev.eventTriggers.includes(event)
          ? prev.eventTriggers.filter((e) => e !== event)
          : [...prev.eventTriggers, event],
      };
    });
  };

  const handleUpdateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebhook) return;
    if (editingWebhook.eventTriggers.length === 0) {
      toast({ title: 'Please select at least one event', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({
      id: editingWebhook.id,
      name: editingWebhook.name || null,
      url: editingWebhook.url,
      eventTriggers: editingWebhook.eventTriggers,
    });
  };

  const handleRegenerateSecret = (webhookId: string) => {
    if (confirm('Are you sure? The old secret will stop working immediately.')) {
      updateMutation.mutate({ id: webhookId, regenerateSecret: true });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return 'bg-green-100 text-green-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      case 'PENDING': return 'bg-yellow-100 text-yellow-700';
      case 'RETRYING': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleCreateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWebhook.eventTriggers.length === 0) {
      toast({ title: 'Please select at least one event', variant: 'destructive' });
      return;
    }
    createMutation.mutate(newWebhook);
  };

  const toggleEventTrigger = (event: string) => {
    setNewWebhook((prev) => ({
      ...prev,
      eventTriggers: prev.eventTriggers.includes(event)
        ? prev.eventTriggers.filter((e) => e !== event)
        : [...prev.eventTriggers, event],
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const webhookCount = data?.webhooks?.length ?? 0;
  const webhookGate = useFeatureGate('maxWebhooks', webhookCount);

  if (webhookGate.limit === 0 && webhookGate.requiresUpgrade) {
    return (
      <FeatureGatePage
        feature="maxWebhooks"
        requiredPlan={webhookGate.requiredPlan}
        description="Automate workflows by sending real-time notifications when bookings are created, cancelled, or rescheduled. Available on the Pro plan."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-red-600">Failed to load webhooks. Please try again.</p>
      </div>
    );
  }

  const webhooks = data?.webhooks || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-2">Webhooks</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Receive real-time notifications when events happen in your account.
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto flex-shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleCreateWebhook}>
              <DialogHeader>
                <DialogTitle>Create Webhook</DialogTitle>
                <DialogDescription>
                  Add a webhook endpoint to receive booking notifications.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    value={newWebhook.name}
                    onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                    placeholder="My Webhook"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Endpoint URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={newWebhook.url}
                    onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                    placeholder="https://example.com/webhooks"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events to Subscribe</Label>
                  <div className="space-y-2">
                    {EVENT_OPTIONS.map((event) => (
                      <label
                        key={event.value}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          newWebhook.eventTriggers.includes(event.value)
                            ? 'border-ocean-500 bg-ocean-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={newWebhook.eventTriggers.includes(event.value)}
                          onChange={() => toggleEventTrigger(event.value)}
                          className="mt-1"
                        />
                        <div>
                          <div className="font-medium text-sm">{event.label}</div>
                          <div className="text-xs text-gray-500">{event.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Webhook'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-6">
              <Webhook className="h-10 w-10 text-ocean-500" />
            </div>
            <h2 className="text-2xl font-heading font-bold text-gray-900 mb-3">
              No Webhooks Yet
            </h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              Set up webhooks to receive real-time notifications when bookings are created,
              cancelled, or rescheduled.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id} className={cn(
              'transition-all',
              !webhook.isActive && 'opacity-60'
            )}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                        {webhook.name || 'Unnamed Webhook'}
                      </h3>
                      {!webhook.isActive && (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                      {webhook.failureCount >= 10 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Failing
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 font-mono truncate mb-3">
                      {webhook.url}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {webhook.eventTriggers.map((event) => (
                        <Badge key={event} variant="outline" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={webhook.isActive}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: webhook.id, isActive: checked })
                      }
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEditDialog(webhook)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openDeliveryDialog(webhook.id)}
                        >
                          <History className="h-4 w-4 mr-2" />
                          Delivery History
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => testMutation.mutate(webhook.id)}
                          disabled={testMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Send Test
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => copyToClipboard(webhook.url)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRegenerateSecret(webhook.id)}
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Regenerate Secret
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this webhook?')) {
                              deleteMutation.mutate(webhook.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 border-t text-sm">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">Last triggered: {formatRelativeTime(webhook.lastTriggeredAt)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{webhook.recentStats.success}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>{webhook.recentStats.failed}</span>
                    </div>
                  </div>
                  <div className="text-gray-500">
                    {webhook.totalDeliveries} total deliveries
                  </div>
                </div>

                {/* Error Message */}
                {webhook.lastErrorMessage && webhook.failureCount > 0 && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                    <div className="font-medium mb-1">Last Error:</div>
                    <div className="font-mono text-xs truncate">{webhook.lastErrorMessage}</div>
                  </div>
                )}

                {/* Secret Section */}
                {webhook.secret && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-medium text-gray-700">Signing Secret: </span>
                        <span className="font-mono text-gray-600">
                          {showSecrets[webhook.id]
                            ? webhook.secret
                            : '••••••••••••••••••••••••••••••••'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowSecrets((prev) => ({
                              ...prev,
                              [webhook.id]: !prev[webhook.id],
                            }))
                          }
                        >
                          {showSecrets[webhook.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        {showSecrets[webhook.id] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(webhook.secret!)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Webhook Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) setEditingWebhook(null);
      }}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleUpdateWebhook}>
            <DialogHeader>
              <DialogTitle>Edit Webhook</DialogTitle>
              <DialogDescription>
                Update your webhook endpoint settings.
              </DialogDescription>
            </DialogHeader>
            {editingWebhook && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name (optional)</Label>
                  <Input
                    id="edit-name"
                    value={editingWebhook.name}
                    onChange={(e) => setEditingWebhook({ ...editingWebhook, name: e.target.value })}
                    placeholder="My Webhook"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-url">Endpoint URL</Label>
                  <Input
                    id="edit-url"
                    type="url"
                    value={editingWebhook.url}
                    onChange={(e) => setEditingWebhook({ ...editingWebhook, url: e.target.value })}
                    placeholder="https://example.com/webhooks"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events to Subscribe</Label>
                  <div className="space-y-2">
                    {EVENT_OPTIONS.map((event) => (
                      <label
                        key={event.value}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          editingWebhook.eventTriggers.includes(event.value)
                            ? 'border-ocean-500 bg-ocean-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={editingWebhook.eventTriggers.includes(event.value)}
                          onChange={() => toggleEditEventTrigger(event.value)}
                          className="mt-1"
                        />
                        <div>
                          <div className="font-medium text-sm">{event.label}</div>
                          <div className="text-xs text-gray-500">{event.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
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

      {/* Delivery History Dialog */}
      <Dialog open={isDeliveryDialogOpen} onOpenChange={(open) => {
        setIsDeliveryDialogOpen(open);
        if (!open) setDeliveryWebhookId(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Delivery History</DialogTitle>
            <DialogDescription>
              Recent webhook delivery attempts and their status.
            </DialogDescription>
          </DialogHeader>
          {isDeliveryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-ocean-500" />
            </div>
          ) : deliveryData?.webhook ? (
            <div className="space-y-4">
              {/* Stats Summary */}
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{deliveryData.webhook.stats.success} success</span>
                </div>
                <div className="flex items-center gap-1.5 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span>{deliveryData.webhook.stats.failed} failed</span>
                </div>
                <div className="flex items-center gap-1.5 text-yellow-600">
                  <Clock className="h-4 w-4" />
                  <span>{deliveryData.webhook.stats.pending} pending</span>
                </div>
              </div>

              {/* Deliveries List */}
              <div className="overflow-y-auto max-h-[50vh] space-y-2">
                {deliveryData.webhook.deliveries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No deliveries yet.
                  </div>
                ) : (
                  deliveryData.webhook.deliveries.map((delivery: WebhookDelivery) => (
                    <div
                      key={delivery.id}
                      className="border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={cn('text-xs', getStatusColor(delivery.status))}>
                            {delivery.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {delivery.eventType}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {delivery.responseTimeMs && (
                            <span className="text-xs text-gray-500">
                              {delivery.responseTimeMs}ms
                            </span>
                          )}
                          {delivery.responseStatus && (
                            <Badge variant="outline" className="text-xs">
                              HTTP {delivery.responseStatus}
                            </Badge>
                          )}
                          {(delivery.status === 'FAILED') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                retryMutation.mutate({
                                  webhookId: deliveryWebhookId!,
                                  deliveryId: delivery.id,
                                })
                              }
                              disabled={retryMutation.isPending}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Attempts: {delivery.attempts}</span>
                        <span>{formatRelativeTime(delivery.createdAt)}</span>
                      </div>
                      {delivery.errorMessage && (
                        <div className="text-xs text-red-600 font-mono bg-red-50 p-2 rounded truncate">
                          {delivery.errorMessage}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Failed to load deliveries.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Documentation Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Webhook Integration Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Payload Structure</h4>
            <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "event": "booking.created",
  "createdAt": "2024-01-15T10:30:00Z",
  "data": {
    "booking": {
      "id": "clxxx...",
      "uid": "abc123...",
      "status": "CONFIRMED",
      "startTime": "2024-01-20T14:00:00Z",
      "endTime": "2024-01-20T15:00:00Z",
      "invitee": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "eventType": {
        "title": "30 Min Meeting",
        "length": 30
      },
      "host": {
        "name": "Jane Smith",
        "email": "jane@example.com"
      }
    }
  }
}`}
            </pre>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Signature Verification</h4>
            <p className="text-sm text-gray-600 mb-2">
              Verify webhook authenticity using the <code className="bg-gray-100 px-1 rounded">X-Webhook-Signature</code> header:
            </p>
            <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto">
{`// Header format: t=timestamp,v1=signature
// Verify: HMAC-SHA256(timestamp.payload, secret) === signature`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
