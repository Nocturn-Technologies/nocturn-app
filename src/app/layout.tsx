import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Nocturn — The Agentic Work OS for Nightlife",
  description:
    "You run the night. Nocturn runs the business.",
  openGraph: {
    title: "Nocturn — The Agentic Work OS for Nightlife",
    description: "You run the night. Nocturn runs the business.",
    url: "https://app.trynocturn.com",
    siteName: "Nocturn",
    images: [
      {
        url: "https://app.trynocturn.com/og-image",
        width: 1200,
        height: 630,
        alt: "Nocturn — The Agentic Work OS for Nightlife",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nocturn — The Agentic Work OS for Nightlife",
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
        className={`${spaceGrotesk.variable} ${inter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
