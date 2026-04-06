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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center animate-in fade-in duration-500">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground truncate max-w-[90vw] md:max-w-sm md:whitespace-normal">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <Button onClick={reset} className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200 min-h-[44px]">
        Try again
      </Button>
    </div>
  );
}
