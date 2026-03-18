"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Confetti-style decorative element */}
        <div className="text-6xl mb-2">
          <span className="inline-block animate-bounce">
            {"\u{1F389}"}
          </span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight font-heading text-foreground">
          You&apos;re in!
        </h1>

        <p className="text-muted-foreground text-lg">
          Your tickets have been confirmed. Check your email for the receipt and
          ticket details.
        </p>

        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-nocturn/10 px-4 py-1.5 text-sm font-medium text-nocturn-light">
            <span className="h-2 w-2 rounded-full bg-nocturn animate-pulse" />
            Payment confirmed
          </div>
          {sessionId && (
            <p className="text-xs text-muted-foreground break-all">
              Reference: {sessionId}
            </p>
          )}
        </div>

        <div className="pt-4 space-y-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-nocturn hover:bg-nocturn-light text-white font-medium px-6 py-3 transition-colors w-full"
          >
            Back to Nocturn
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Questions? Reach out to the event organizer or contact us at{" "}
          <a
            href="mailto:support@nocturn.app"
            className="underline hover:text-foreground"
          >
            support@nocturn.app
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
