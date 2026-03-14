/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000,
  },
  compress: true,
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui', '@tiptap'],
  },
  async redirects() {
    return [
      {
        source: '/contact',
        destination: '/contact-us',
        permanent: false,
      },
    ];
  },
}

export default nextConfig