/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = `
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'self';
script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com https://clerk-telemetry.com https://va.vercel-scripts.com https://checkout.razorpay.com https://*.razorpay.com;
script-src-elem 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com https://va.vercel-scripts.com https://checkout.razorpay.com https://*.razorpay.com;
connect-src 'self' ${isDev ? 'ws: wss: http://localhost:* https://localhost:*' : ''} https://*.clerk.com https://*.clerk.accounts.dev https://clerk.browser.com https://challenges.cloudflare.com https://clerk-telemetry.com https://va.vercel-scripts.com https://api.razorpay.com https://*.razorpay.com https://lumberjack.razorpay.com;
img-src 'self' data: blob: https:;
style-src 'self' 'unsafe-inline';
font-src 'self' data: https:;
frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com;
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
  // Drops the `X-Powered-By: Next.js` response header -- a few bytes saved
  // on every single response, and one less thing that fingerprints the stack.
  poweredByHeader: false,
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
  // sharp is a native module -- it must not be traced/bundled into the server
  // build. Upload routes import it directly to downscale images before they
  // ever reach R2 (app/api/upload/image/route.ts).
  serverExternalPackages: ['sharp'],
  experimental: {
    // Rewrites barrel imports (`import { X } from "recharts"`) into direct
    // module paths at build time, so a page that uses one chart or one date
    // helper doesn't pull the whole package into its JS chunk.
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui',
      '@tiptap',
      'recharts',
      'date-fns',
      'framer-motion',
    ],
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        ...(process.env.CODESPACE_NAME
          ? [`${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}`]
          : []),
      ],
    },
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
      {
        // Long-lived immutable caching for public/ assets (logo, hero image,
        // favicon, self-hosted font files). This has to live here rather than
        // in middleware.ts: middleware's matcher explicitly excludes these
        // extensions so it never runs for them -- the equivalent block that
        // used to sit in middleware.ts was dead code.
        source: '/:path*.(jpg|jpeg|png|gif|svg|webp|avif|ico|woff|woff2|ttf|eot)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;