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
        if (path.startsWith('/dashboard')) {
          return !!token
        }

        // API routes that require authentication
        if (path.startsWith('/api/')) {
          // Public API routes
          const publicApiRoutes = [
            '/api/auth',
            '/api/slots',
            '/api/bookings', // POST for creating bookings is public
            '/api/users/check-username',
          ]

          // Check if it's a public route
          if (publicApiRoutes.some((route) => path.startsWith(route))) {
            return true
          }

          // All other API routes require auth
          return !!token
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
