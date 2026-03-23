// ── Service functions (public API for route handlers) ────────────────────────

export {
  calculateSlots,
  SlotsEventTypeNotFoundError,
  SlotsNoScheduleError,
} from './calculate-slots'
export type { CalculateSlotsParams, CalculateSlotsResult } from './calculate-slots'

export {
  calculateTeamSlots,
  TeamSlotsTeamNotFoundError,
  TeamSlotsEventTypeNotFoundError,
  TeamSlotsNotTeamSchedulingError,
} from './calculate-team-slots'
export type { CalculateTeamSlotsParams, CalculateTeamSlotsResult } from './calculate-team-slots'
