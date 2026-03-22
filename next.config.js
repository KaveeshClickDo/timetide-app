/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },
  // Enable instrumentation hook for queue worker initialization
  experimental: {
    instrumentationHook: true,
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]
    return [
      // Embeddable booking pages — allow iframes from any origin
      {
        source: '/:username/:slug',
        headers: securityHeaders,
      },
      {
        source: '/team/:teamSlug/:eventSlug',
        headers: securityHeaders,
      },
      // Everything else — block iframes
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          ...securityHeaders,
        ],
      },
    ]
  },
}

export default nextConfig
