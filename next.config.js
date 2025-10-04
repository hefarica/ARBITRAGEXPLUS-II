/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    APP_VERSION: "3.6.0",
    BUILD_ID: `${Date.now()}`,
  },
  async rewrites() {
    return [];
  },
  // Configuración de producción optimizada
  swcMinify: true,
  poweredByHeader: false,
  // Optimización de imágenes
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.gravatar.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Configuración de cabeceras HTTP
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
  // Configuración de webpack personalizada
  webpack: (config, { isServer }) => {
    // Optimizaciones para el bundle final
    if (!isServer) {
      // No agrupar módulos específicos
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        monaco: {
          test: /[\\/]node_modules[\\/]monaco-editor[\\/]/,
          name: 'monaco',
          priority: 10,
          chunks: 'async',
        },
        ui: {
          test: /[\\/]components[\\/]ui[\\/]/,
          name: 'ui-components',
          chunks: 'all',
          enforce: true,
        },
      }
    }

    return config
  },
};

module.exports = nextConfig;
