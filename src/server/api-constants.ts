/**
 * Shared constants for API routes.
 * Keep separate from constants.ts which imports lucide-react (client-side).
 */

// ============================================================================
// PAGINATION
// ============================================================================

/** Default page size for paginated list endpoints */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size clients can request */
export const MAX_PAGE_SIZE = 100

/** Maximum items returned for notification/audit endpoints */
export const MAX_LIST_LIMIT = 50

// ============================================================================
// SCHEDULING
// ============================================================================

/** Minutes to extend calendar busy-time queries beyond the actual slot window.
 *  Ensures we catch events that overlap due to buffer times. */
export const CALENDAR_FETCH_BUFFER_MINUTES = 60
