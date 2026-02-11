import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    // Allow the request to continue
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname

        // Protected routes that require authentication
        // Check token.id (not just !!token) so invalidated tokens {} are rejected
        if (path.startsWith('/dashboard')) {
          return !!token?.id
        }

        // API routes that require authentication
        if (path.startsWith('/api/')) {
          // Protected API routes (require auth)
          const protectedApiRoutes = [
            '/api/availability',
            '/api/event-types',
            '/api/users/me',
            '/api/webhooks',
            '/api/teams',
            '/api/calendars',
          ]

          // Only require auth for explicitly protected routes
          if (protectedApiRoutes.some((route) => path.startsWith(route))) {
            return !!token?.id
          }

          // All other API routes are public (auth, public, slots, bookings, users/[username])
          return true
        }

        // All other routes are public
        return true
      },
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
