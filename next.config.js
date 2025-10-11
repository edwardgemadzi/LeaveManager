/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  // Enable modern JSX transform
  compiler: {
    reactRemoveProperties: false,
  },
  // Improve development experience
  experimental: {
    // Disable source maps in development to reduce warnings
    esmExternals: true,
  },
  // Webpack configuration for better HMR
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Improve HMR reliability
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

module.exports = nextConfig
