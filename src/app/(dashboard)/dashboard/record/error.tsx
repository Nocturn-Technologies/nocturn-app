"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold font-heading">Something went wrong</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <Button onClick={reset} className="bg-nocturn hover:bg-nocturn-light">
        Try again
      </Button>
    </div>
  );
}
