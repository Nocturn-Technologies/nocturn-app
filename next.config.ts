import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://us.posthog.com https://us.i.posthog.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com https://*.googleapis.com https://*.gstatic.com https://*.replicate.delivery https://cdn.replicate.com",
              "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.anthropic.com https://maps.googleapis.com https://app.posthog.com https://us.posthog.com https://us.i.posthog.com https://*.replicate.delivery",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.google.com",
              "font-src 'self' https://fonts.gstatic.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zvmslijvdkcnkrjjgaie.supabase.co",
        pathname: "/storage/**",
      },
      {
        protocol: "https",
        hostname: "**.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.replicate.delivery",
      },
      {
        protocol: "https",
        hostname: "cdn.replicate.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js", "@stripe/react-stripe-js", "date-fns", "qrcode", "posthog-js"],
  },
  poweredByHeader: false,
};

export default withSentryConfig(nextConfig, {
  org: "nocturn",
  project: "javascript-nextjs",
  silent: !process.env.CI,
});
