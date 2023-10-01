/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: 'storage.googleapis.com',
            port: '',
            pathname: '/526e6878-501f-4571-bfc8-0e78947cd452/**',
          },
        ],
      },
}

module.exports = nextConfig
