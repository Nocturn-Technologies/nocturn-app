import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Nocturn — AI for Music Collectives and Promoters",
  description:
    "You run the night. Nocturn runs the business.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='12' fill='%237B2FF7'/><circle cx='20' cy='14' r='10' fill='%2309090B'/></svg>",
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
        <link rel="preconnect" href="https://zvmslijvdkcnkrjjgaie.supabase.co" />
        <link rel="preconnect" href="https://js.stripe.com" />
        <link rel="dns-prefetch" href="https://zvmslijvdkcnkrjjgaie.supabase.co" />
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
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-nocturn focus:text-white focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to content
        </a>
        <Suspense fallback={null}>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
