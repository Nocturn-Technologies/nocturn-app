"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Check, Trash2, MousePointerClick } from "lucide-react";
import { AddExternalEventDialog } from "@/components/add-external-event-dialog";
import { deleteExternalEvent } from "@/app/actions/external-events";

interface ExternalEvent {
  id: string;
  title: string;
  externalUrl: string;
  platform: string | null;
  eventDate: string | null;
  venueName: string | null;
  token: string | null;
  clickCount: number;
}

const platformColors: Record<string, string> = {
  eventbrite: "bg-orange-500/10 text-orange-400",
  posh: "bg-pink-500/10 text-pink-400",
  ra: "bg-blue-500/10 text-blue-400",
  dice: "bg-emerald-500/10 text-emerald-400",
  shotgun: "bg-yellow-500/10 text-yellow-400",
  partiful: "bg-purple-500/10 text-purple-400",
  other: "bg-white/5 text-white/50",
};

export function ExternalEventsSection({
  initialEvents,
  appUrl,
}: {
  initialEvents: ExternalEvent[];
  appUrl: string;
}) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  async function handleCopy(token: string, eventId: string) {
    const link = `${appUrl}/go/${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(eventId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDelete(eventId: string) {
    if (!confirm("Delete this external event?")) return;
    setDeletingId(eventId);
    setDeleteSuccess(null);
    await deleteExternalEvent(eventId);
    setDeletingId(null);
    setDeleteSuccess("External event deleted");
    setTimeout(() => setDeleteSuccess(null), 3000);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-nocturn" />
            External Events
          </CardTitle>
          <AddExternalEventDialog onAdded={() => router.refresh()} />
        </div>
      </CardHeader>
      <CardContent>
        {deleteSuccess && (
          <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-500 animate-in fade-in duration-200">
            {deleteSuccess}
          </div>
        )}
        {initialEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10">
              <ExternalLink className="h-6 w-6 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No external events yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                Promote events hosted on Eventbrite, Posh, RA, or any other platform. Paste a link to track clicks and share with your audience.
              </p>
            </div>
            <AddExternalEventDialog onAdded={() => router.refresh()} />
          </div>
        ) : (
          <div className="space-y-2">
            {initialEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between py-3 border-b border-border last:border-0 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    {event.platform && event.platform !== "other" && (
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${platformColors[event.platform] || platformColors.other}`}>
                        {event.platform}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {event.eventDate && new Date(event.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {event.venueName && ` · ${event.venueName}`}
                    {" · "}
                    <span className="inline-flex items-center gap-0.5">
                      <MousePointerClick className="h-3 w-3" />
                      {event.clickCount} clicks
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {event.token && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleCopy(event.token!, event.id)}
                    >
                      {copiedId === event.id ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                    onClick={() => handleDelete(event.id)}
                    disabled={deletingId === event.id}
                  >
                    {deletingId === event.id ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
