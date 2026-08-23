/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = `
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'self';
script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com https://clerk-telemetry.com https://va.vercel-scripts.com;
script-src-elem 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com https://va.vercel-scripts.com;
connect-src 'self' ${isDev ? 'ws: wss: http://localhost:* https://localhost:*' : ''} https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com https://clerk-telemetry.com https://va.vercel-scripts.com;
img-src 'self' data: blob: https:;
style-src 'self' 'unsafe-inline';
font-src 'self' data: https:;
frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com;
worker-src 'self' blob:;
manifest-src 'self';
`
  .replace(/\n/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
    // No source image in public/images is wider than 1920. Next clamps a
    // variant to the source width, so 2048/3840 only ever re-encoded the same
    // pixels into extra cache entries -- and for `fill` images Next uses the
    // largest entry as the fallback `src`, which pointed the most expensive
    // transcode of all at the hero.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;