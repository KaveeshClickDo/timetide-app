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
