// Centralized webhook types

export type WebhookDeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING'

export interface WebhookDelivery {
  id: string
  eventType: string
  status: WebhookDeliveryStatus
  attempts: number
  responseStatus: number | null
  responseTimeMs: number | null
  errorMessage: string | null
  deliveredAt: string | null
  createdAt: string
}

export interface WebhookData {
  id: string
  name: string | null
  url: string
  secret?: string
  eventTriggers: string[]
  isActive: boolean
  failureCount: number
  lastTriggeredAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastErrorMessage: string | null
  createdAt: string
  totalDeliveries: number
  recentStats: {
    success: number
    failed: number
  }
}
