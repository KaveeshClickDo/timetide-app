// ── Team CRUD ─────────────────────────────────────────────────────────────────

export {
  listTeams,
  createTeam,
  getTeamDetails,
  updateTeam,
  deleteTeam,
  TeamNotFoundError,
  TeamNotAuthorizedError,
  TeamSlugTakenError,
  TeamFeatureDeniedError,
  TeamSubscriptionLockedError,
} from './team-crud'
export type { CreateTeamInput, UpdateTeamInput } from './team-crud'

// ── Team Members ──────────────────────────────────────────────────────────────

export {
  listTeamMembers,
  addTeamMember,
  getTeamMember,
  updateTeamMember,
  removeTeamMember,
  bulkMemberAction,
  listMemberIntegrations,
  MemberNotFoundError,
  MemberNotAuthorizedError,
  MemberAlreadyExistsError,
  MemberUserNotFoundError,
  MemberOnlyOwnerCanAddOwnerError,
  MemberLastOwnerError,
  MemberOwnerModifyError,
  MemberFeatureDeniedError,
  MemberSubscriptionLockedError,
  MemberNoValidMembersError,
} from './team-members'
export type { AddTeamMemberInput, UpdateTeamMemberInput, BulkMemberActionInput } from './team-members'

// ── Team Invitations ──────────────────────────────────────────────────────────

export {
  listTeamInvitations,
  createTeamInvitation,
  cancelTeamInvitation,
  InvitationNotAuthorizedError,
  InvitationFeatureDeniedError,
  InvitationSubscriptionLockedError,
  InvitationOwnerOnlyError,
  InvitationAlreadyMemberError,
  InvitationAlreadySentError,
  InvitationTeamNotFoundError,
  InvitationNotFoundError,
  InvitationNotPendingError,
} from './team-invitations'
export type { CreateInvitationInput } from './team-invitations'

// ── Team Event Types ──────────────────────────────────────────────────────────

export {
  listTeamEventTypes,
  getTeamEventType,
  createTeamEventType,
  updateTeamEventType,
  deleteTeamEventType,
  listEventTypeAssignments,
  assignMemberToEventType,
  removeEventTypeAssignment,
  TeamEventTypeNotFoundError,
  TeamEventTypeNotAuthorizedError,
  TeamEventTypeFeatureDeniedError,
  TeamEventTypeSubscriptionLockedError,
  TeamEventTypeSlugTakenError,
  TeamEventTypeAssignmentExistsError,
  TeamEventTypeAssignmentNotFoundError,
  TeamEventTypeMemberNotFoundError,
} from './team-event-types'
export type {
  CreateTeamEventTypeInput,
  UpdateTeamEventTypeInput,
  AssignMemberInput,
} from './team-event-types'

// ── Team Logo ─────────────────────────────────────────────────────────────────

export {
  uploadTeamLogo,
  deleteTeamLogo,
  LogoNotAuthorizedError,
  LogoNoFileError,
  LogoInvalidTypeError,
  LogoTooLargeError,
} from './team-logo'

// ── Team Audit Log ────────────────────────────────────────────────────────────

export {
  listTeamAuditLog,
  AuditLogNotAuthorizedError,
} from './team-audit-log'
export type { ListAuditLogParams } from './team-audit-log'
