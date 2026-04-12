"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { duplicateEvent } from "@/app/actions/events";

export function DuplicateEventTile({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await duplicateEvent(eventId);
      if (result.error || !result.eventId) {
        setError(result.error ?? "Failed to duplicate");
        return;
      }
      // Land on the edit page so the promoter can update the date and details.
      router.push(`/dashboard/events/${result.eventId}/edit`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title={error ?? "Duplicate this event as a new draft"}
      className="group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card/50 p-3 transition-all hover:border-nocturn/40 hover:bg-card active:scale-[0.97] disabled:opacity-60 disabled:cursor-wait"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-nocturn-amber/10 text-nocturn-amber transition-colors group-hover:bg-nocturn-amber/15">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </div>
      <span className="text-xs font-medium text-center leading-tight">
        {error ? "Try again" : "Duplicate"}
      </span>
    </button>
  );
}
