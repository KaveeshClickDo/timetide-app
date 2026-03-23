/**
 * OAuth State Parameter Helpers
 * Encodes/decodes userId and returnTo path in the OAuth state parameter
 * so callbacks can redirect users back to their original page.
 */

/**
 * Encode OAuth state with userId and optional returnTo path
 */
export function encodeOAuthState(userId: string, returnTo?: string): string {
  if (!returnTo) return userId
  return `${userId}::${encodeURIComponent(returnTo)}`
}

/**
 * Decode OAuth state to extract userId and returnTo path
 */
export function decodeOAuthState(state: string): { userId: string; returnTo: string } {
  const DEFAULT_RETURN = '/dashboard/settings'
  const separatorIndex = state.indexOf('::')

  if (separatorIndex === -1) {
    return { userId: state, returnTo: DEFAULT_RETURN }
  }

  const userId = state.substring(0, separatorIndex)
  const returnTo = decodeURIComponent(state.substring(separatorIndex + 2))

  // Security: only allow internal dashboard paths
  if (!returnTo.startsWith('/dashboard/')) {
    return { userId, returnTo: DEFAULT_RETURN }
  }

  return { userId, returnTo }
}

/**
 * Build a full redirect URL by appending query params to a returnTo path
 */
export function buildRedirectUrl(
  returnTo: string,
  params: Record<string, string>
): URL {
  const url = new URL(returnTo, process.env.NEXT_PUBLIC_APP_URL)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return url
}
