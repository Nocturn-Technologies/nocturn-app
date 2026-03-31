"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20" role="alert">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-lg font-bold">Something went wrong</p>
        <p className="text-sm text-muted-foreground max-w-[320px]">
          {error.message && !error.digest
            ? error.message
            : "We couldn\u2019t load this page. Please try again or go back to events."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/events">
          <Button variant="outline" size="sm" className="min-h-[44px]">
            Go back to events
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onClick={reset}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
