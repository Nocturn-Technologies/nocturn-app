"use client";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
      <Button variant="outline" size="sm" onClick={reset}>Try again</Button>
    </div>
  );
}
