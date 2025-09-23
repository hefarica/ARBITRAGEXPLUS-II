/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    APP_VERSION: "3.6.0",
    BUILD_ID: `${Date.now()}`,
  },
  async rewrites() {
    return [
      // Redirigir llamadas a la API local durante el desarrollo
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
          : "http://localhost:3000/api/:path*",
      },
      // Redirigir llamadas a la API de Cloudflare
      {
        source: "/cf/:path*",
        destination: process.env.NEXT_PUBLIC_CF_URL
          ? `${process.env.NEXT_PUBLIC_CF_URL}/:path*`
          : "https://arbitragex-supreme.workers.dev/:path*",
      },
    ];
  },
  // Configuración de producción optimizada
  swcMinify: true,
  poweredByHeader: false,
  // Configuración para compilación y exportación
  output: 'standalone',
  // Optimización de imágenes
  images: {
    domains: ['www.gravatar.com'],
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
  // Servidor de desarrollo
  devServer: {
    port: 3100,
  },
};

module.exports = nextConfig;
