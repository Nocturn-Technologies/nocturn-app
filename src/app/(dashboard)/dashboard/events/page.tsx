import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "lucide-react";
import Link from "next/link";
import { SwipeableEventList } from "@/components/events/swipeable-event-list";

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get user's collectives
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  // Fetch events
  let events: Array<{
    id: string;
    title: string;
    slug: string;
    starts_at: string;
    status: string;
    flyer_url: string | null;
    venues: { name: string; city: string } | null;
  }> = [];

  if (collectiveIds.length > 0) {
    const { data } = await admin
      .from("events")
      .select("id, title, slug, starts_at, status, flyer_url, venues(name, city)")
      .in("collective_id", collectiveIds)
      .order("starts_at", { ascending: false });
    events = (data ?? []) as unknown as typeof events;
  }

  const upcoming = events.filter(
    (e) => e.status !== "completed" && e.status !== "cancelled" && new Date(e.starts_at) >= new Date()
  );
  const past = events.filter(
    (e) => e.status === "completed" || new Date(e.starts_at) < new Date()
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
                <SwipeableEventList events={upcoming} />
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground">Past</h2>
              <div className="grid gap-3">
                <SwipeableEventList events={past} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

