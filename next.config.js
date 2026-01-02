/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // Removed deprecated experimental.serverActions - it's enabled by default in Next.js 14+
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
}

module.exports = nextConfig