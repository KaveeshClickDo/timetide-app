// Centralized user-related types

/** Public user profile */
export interface UserProfile {
  id: string
  name: string | null
  username: string
  image: string | null
  bio?: string | null
  timezone?: string
}
