import type { Metadata } from "next";
import { NocturnLogo } from "@/components/nocturn-logo";

export const metadata: Metadata = {
  title: { default: "Nocturn", template: "%s — Nocturn" },
  description: "Sign in to your Nocturn account. AI-powered operations for music collectives and promoters.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Ambient aurora — two soft orbs drifting behind content */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-nocturn/[0.10] blur-[140px]"
          style={{ animation: "float 12s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[35%] -right-32 h-[380px] w-[380px] rounded-full bg-[#A855F7]/[0.06] blur-[120px]"
          style={{ animation: "float 14s ease-in-out infinite reverse" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(123,47,247,0.05),transparent_55%)]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 py-10 md:py-16">
        <div className="animate-fade-in-up flex flex-col items-center text-center">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 scale-150 rounded-full bg-nocturn/15 blur-2xl"
              style={{ animation: "pulseGlow 4s ease-in-out infinite" }}
            />
            <NocturnLogo size="lg" />
          </div>
          <p className="mt-3 text-[13px] tracking-wide text-muted-foreground">
            AI for music collectives and promoters
          </p>
        </div>

        <div className="mt-10 w-full animate-fade-in-up" style={{ animationDelay: "120ms" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
