import type { Metadata, Viewport } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Nocturn — AI for Music Collectives and Promoters",
  description:
    "You run the night. Nocturn runs the business.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌙</text></svg>",
  },
  openGraph: {
    title: "Nocturn — AI for Music Collectives and Promoters",
    description: "You run the night. Nocturn runs the business.",
    url: "https://app.trynocturn.com",
    siteName: "Nocturn",
    images: [
      {
        url: "https://app.trynocturn.com/og-image",
        width: 1200,
        height: 630,
        alt: "Nocturn — AI for Music Collectives and Promoters",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nocturn — AI for Music Collectives and Promoters",
    description: "You run the night. Nocturn runs the business.",
    images: ["https://app.trynocturn.com/og-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Preconnect to critical third-party origins */}
        <link rel="preconnect" href="https://bpzwbqtpyorppijdblhy.supabase.co" />
        <link rel="preconnect" href="https://js.stripe.com" />
        <link rel="dns-prefetch" href="https://bpzwbqtpyorppijdblhy.supabase.co" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7B2FF7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={`${outfit.variable} ${dmSans.variable} antialiased`}
      >
        <Suspense fallback={null}>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
