"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { SwipeableCard } from "@/components/swipeable-card";
import { publishEvent } from "@/app/actions/events";
import { haptic } from "@/lib/haptics";
import { MapPin, Clock, Music } from "lucide-react";

interface EventItem {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  venues: { name: string; city: string } | null;
}

export function SwipeableEventList({ events }: { events: EventItem[] }) {
  const router = useRouter();
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);

  async function handlePublish(eventId: string) {
    haptic("medium");
    await publishEvent(eventId);
    router.refresh();
  }

  function handleArchivePrompt(eventId: string) {
    haptic("medium");
    setArchiveConfirm(eventId);
  }

  return (
    <>
      {events.map((event) => (
        <SwipeableCard
          key={event.id}
          onSwipeRight={
            event.status === "draft"
              ? () => handlePublish(event.id)
              : undefined
          }
          onSwipeLeft={() => handleArchivePrompt(event.id)}
          rightLabel={event.status === "draft" ? "Publish" : ""}
          leftLabel="Archive"
          disabled={event.status === "draft" ? false : true}
        >
          <Link href={`/dashboard/events/${event.id}`}>
            <SwipeableEventCard event={event} />
          </Link>
        </SwipeableCard>
      ))}

      {/* Archive confirmation dialog */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-lg font-semibold">Archive this event?</h3>
            <p className="text-sm text-muted-foreground">
              This will remove the event from your active list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setArchiveConfirm(null)}
                className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Archive action would go here
                  setArchiveConfirm(null);
                  router.refresh();
                }}
                className="flex-1 rounded-lg bg-red-500/15 py-2 text-sm font-medium text-red-400 hover:bg-red-500/25"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SwipeableEventCard({ event }: { event: EventItem }) {
  const date = new Date(event.starts_at);
  const statusColors: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-500",
    published: "bg-green-500/10 text-green-500",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-red-500/10 text-red-500",
  };

  return (
    <Card className="transition-colors hover:border-nocturn/30 cursor-pointer">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-nocturn/10 text-nocturn">
          <span className="text-xs font-medium uppercase">
            {date.toLocaleDateString("en", { month: "short" })}
          </span>
          <span className="text-lg font-bold leading-none">
            {date.getDate()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{event.title}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {event.venues && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.venues.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {date.toLocaleTimeString("en", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Music className="h-3 w-3" />
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            statusColors[event.status] ?? ""
          }`}
        >
          {event.status}
        </span>
      </CardContent>
    </Card>
  );
}
