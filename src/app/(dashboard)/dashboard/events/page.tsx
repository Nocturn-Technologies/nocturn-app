import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Sparkles } from "lucide-react";
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

  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

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
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-muted-foreground truncate">
            Create and manage your events
          </p>
        </div>
        <Link href="/dashboard/events/new" className="shrink-0">
          <Button className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-nocturn/10">
              <Sparkles className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-bold">No events yet</p>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                Tell our AI what you&apos;re planning and it&apos;ll build your event page, ticket tiers, and promo assets.
              </p>
            </div>
            <Link href="/dashboard/events/new">
              <Button className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200 mt-2">
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Event
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold">Upcoming</h2>
              <div className="grid gap-3">
                <SwipeableEventList events={upcoming} />
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-muted-foreground">Past</h2>
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

