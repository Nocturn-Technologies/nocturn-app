import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "bpzwbqtpyorppijdblhy.supabase.co",
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
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js"],
  },
  poweredByHeader: false,
};

export default withSentryConfig(nextConfig, {
  org: "nocturn",
  project: "javascript-nextjs",
  silent: !process.env.CI,
});
