import type { Metadata } from "next";
import { NocturnLogo } from "@/components/nocturn-logo";

export const metadata: Metadata = {
  title: "Log in — Nocturn",
  description: "Sign in to your Nocturn account. AI-powered operations for music collectives and promoters.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center">
          <NocturnLogo size="lg" />
          <p className="mt-1 text-sm text-muted-foreground">
            AI for music collectives and promoters
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
