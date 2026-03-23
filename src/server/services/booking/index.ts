// ── Service functions (public API for route handlers) ─────────────────────────

export { listBookings, getBookingStats, type ListBookingsParams, type BookingStats } from './list-bookings'
export {
  getBookingDetails,
  BookingNotFoundError,
  BookingUnauthorizedError,
  type GetBookingParams,
} from './get-booking'
export {
  createBooking,
  EmailVerificationRequiredError,
  EmailVerificationFailedError,
  EventTypeNotFoundError,
  RecurringNotAllowedError,
  RecurringWindowError,
  SeatsFullError,
  MemberConflictError,
  SerializationConflictError,
  type CreateBookingInput,
  type CreateBookingResult,
} from './create-booking'
export {
  skipOrUnskipBooking,
  confirmOrRejectBooking,
  BookingNotPendingError,
  SkipNotRecurringError,
  BookingAccessDeniedError,
  type SkipBookingParams,
  type SkipBookingResult,
  type ConfirmRejectParams,
  type ConfirmRejectResult,
} from './confirm-reject-booking'
export {
  cancelBooking,
  CancelBookingNotFoundError,
  CancelBookingUnauthorizedError,
  type CancelBookingParams,
  type CancelBookingResult,
} from './cancel-booking'
export {
  rescheduleBooking,
  RescheduleBookingNotFoundError,
  RescheduleUnauthorizedError,
  RescheduleTimeInPastError,
  RescheduleConflictError,
  type RescheduleBookingParams,
  type RescheduleBookingResult,
} from './reschedule-booking'
export {
  assignTeamMember,
  getAvailableMembers,
  AssignBookingNotFoundError,
  AssignUnauthorizedError,
  AssignNotManagedError,
  AssignMemberNotFoundError,
  type AssignMemberParams,
  type AssignMemberResult,
  type GetAvailableMembersParams,
} from './assign-member'

// ── Internal building blocks (used by service functions above) ────────────────

export { selectTeamMember, TeamSelectionError, type HostInfo, type TeamSelectionResult } from './select-team-member'
export { validateSlotAvailability, SlotUnavailableError, MinimumNoticeError } from './validate-slot'
export { validateRecurringSlots, RecurringSlotError } from './validate-recurring'
export { createCalendarEvents } from './create-calendar-events'
export { sendBookingNotifications } from './send-notifications'
export {
  extractTeamMembersForEmail,
  buildBookingEmailData,
  buildWebhookBookingPayload,
  cleanupBookingCalendarEvents,
  sendBookingInAppNotification,
  authorizeBookingAccess,
} from './booking-helpers'
export { generateMeetingLinkOnConfirm } from './generate-meeting-link'
