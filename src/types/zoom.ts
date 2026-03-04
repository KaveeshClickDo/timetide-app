// Centralized Zoom integration types

export interface CreateZoomMeetingParams {
  userId: string
  topic: string
  startTime: Date
  duration: number
  timezone: string
  agenda?: string
}

export interface CreateZoomMeetingResult {
  meetingId: string
  meetingUrl: string
  joinUrl: string
  password?: string
}
