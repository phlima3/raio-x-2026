/** @type {import('next').NextConfig} */
const nextConfig = {
  // TODO: Add image domains for candidate photos (TSE CDN, candidate sites)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dadosabertos.tse.jus.br',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'www.senado.leg.br',
      },
      {
        protocol: 'https',
        hostname: 'www.camara.leg.br',
      },
    ],
  },

  // TODO: Set up redirects for old URL patterns
  async redirects() {
    return []
  },

  // TODO: Configure headers for security (CSP, X-Frame-Options)
  async headers() {
    return []
  },
}

export default nextConfig
