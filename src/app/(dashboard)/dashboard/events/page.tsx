import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, MapPin, Clock, Music } from "lucide-react";
import Link from "next/link";

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's collectives
  const { data: memberships } = await supabase
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  // Fetch events
  let events: Array<{
    id: string;
    title: string;
    slug: string;
    date: string;
    status: string;
    cover_image_url: string | null;
    venues: { name: string; city: string } | null;
  }> = [];

  if (collectiveIds.length > 0) {
    const { data } = await supabase
      .from("events")
      .select("id, title, slug, date, status, cover_image_url, venues(name, city)")
      .in("collective_id", collectiveIds)
      .order("date", { ascending: false });
    events = (data ?? []) as unknown as typeof events;
  }

  const upcoming = events.filter(
    (e) => e.status !== "completed" && e.status !== "cancelled" && new Date(e.date) >= new Date()
  );
  const past = events.filter(
    (e) => e.status === "completed" || new Date(e.date) < new Date()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage your events
          </p>
        </div>
        <Link href="/dashboard/events/new">
          <Button className="bg-nocturn hover:bg-nocturn-light">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Calendar className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No events yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first event to start selling tickets and generating marketing content.
              </p>
            </div>
            <Link href="/dashboard/events/new">
              <Button className="bg-nocturn hover:bg-nocturn-light">
                <Plus className="mr-2 h-4 w-4" />
                Create Event
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Upcoming</h2>
              <div className="grid gap-3">
                {upcoming.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">Past</h2>
              <div className="grid gap-3">
                {past.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
}: {
  event: {
    id: string;
    title: string;
    date: string;
    status: string;
    venues: { name: string; city: string } | null;
  };
}) {
  const date = new Date(event.date);
  const statusColors: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-500",
    published: "bg-green-500/10 text-green-500",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-red-500/10 text-red-500",
  };

  return (
    <Card className="transition-colors hover:border-nocturn/30">
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
              {date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        </div>
        <Link
          href={`/dashboard/events/${event.id}/lineup`}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-nocturn/10 hover:text-nocturn transition-colors"
        >
          <Music className="h-3 w-3" />
          Lineup
        </Link>
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
