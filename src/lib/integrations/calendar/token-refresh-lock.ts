/**
 * Simple per-key async lock to prevent concurrent token refreshes.
 * If a refresh is already in progress for a calendarId, subsequent
 * callers wait for and reuse the same result.
 */

const pending = new Map<string, Promise<string | null>>()

export function withRefreshLock(
  calendarId: string,
  refreshFn: () => Promise<string | null>
): Promise<string | null> {
  const existing = pending.get(calendarId)
  if (existing) return existing

  const promise = refreshFn().finally(() => {
    pending.delete(calendarId)
  })

  pending.set(calendarId, promise)
  return promise
}
