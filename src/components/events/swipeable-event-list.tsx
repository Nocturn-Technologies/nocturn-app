"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { SwipeableCard } from "@/components/swipeable-card";
import { publishEvent } from "@/app/actions/events";
import { haptic } from "@/lib/haptics";
import { MapPin, Clock } from "lucide-react";

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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold">Archive this event?</h3>
            <p className="text-sm text-muted-foreground">
              This will remove the event from your active list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setArchiveConfirm(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent active:scale-95 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setArchiveConfirm(null);
                  router.refresh();
                }}
                className="flex-1 rounded-xl bg-red-500/15 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/25 active:scale-95 transition-all duration-200"
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
    <Card className="rounded-2xl transition-all duration-200 hover:border-nocturn/30 active:scale-[0.98] cursor-pointer">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-nocturn/10 text-nocturn">
          <span className="text-xs font-medium uppercase">
            {date.toLocaleDateString("en", { month: "short" })}
          </span>
          <span className="text-lg font-bold leading-none">
            {date.getDate()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{event.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {event.venues && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.venues.name}</span>
              </span>
            )}
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" />
              {date.toLocaleTimeString("en", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-colors duration-200 ${
            statusColors[event.status] ?? ""
          }`}
        >
          {event.status}
        </span>
      </CardContent>
    </Card>
  );
}
