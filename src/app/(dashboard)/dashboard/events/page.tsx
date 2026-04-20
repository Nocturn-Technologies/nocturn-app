import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles, AlertCircle, Users } from "lucide-react";
import Link from "next/link";
import { CollapsibleEventSection } from "@/components/events/collapsible-event-section";
import { EventSuggestions } from "@/components/events/event-suggestions";
import { getEventSuggestions } from "@/app/actions/event-suggestions";

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) { const { redirect } = await import("next/navigation"); redirect("/login"); return; }

  const admin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  type EventRow = {
    id: string;
    title: string;
    slug: string;
    starts_at: string;
    status: string;
    flyer_url: string | null;
    venue_name: string | null;
    city: string | null;
  };

  let collectiveIds: string[] = [];
  let events: EventRow[] = [];
  let suggestions: Awaited<ReturnType<typeof getEventSuggestions>> = [];
  let fetchError: string | null = null;

  try {
    const { data: memberships, error: membershipsError } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (membershipsError) {
      throw new Error(membershipsError.message);
    }

    collectiveIds = memberships?.map((m) => m.collective_id) ?? [];
    const primaryCollectiveId = collectiveIds[0] ?? null;

    const [eventsResult, suggestionsResult] = await Promise.all([
      collectiveIds.length > 0
        ? admin
            .from("events")
            .select("id, title, slug, starts_at, status, flyer_url, venue_name, city")
            .in("collective_id", collectiveIds)
            .order("starts_at", { ascending: false })
        : Promise.resolve({ data: null, error: null }),
      primaryCollectiveId
        ? getEventSuggestions(primaryCollectiveId)
        : Promise.resolve([]),
    ]);

    if (eventsResult.error) {
      throw new Error(eventsResult.error.message);
    }

    events = (eventsResult.data ?? []) as unknown as EventRow[];
    suggestions = suggestionsResult;
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load events";
  }

  const now = new Date();
  const drafts = events.filter((e) => e.status === "draft");
  const published = events.filter(
    (e) => e.status === "published" && new Date(e.starts_at) >= now
  );
  const past = events.filter(
    (e) => e.status === "completed" || (e.status !== "draft" && e.status !== "cancelled" && new Date(e.starts_at) < now)
  );
  const cancelled = events.filter((e) => e.status === "cancelled");

  if (fetchError) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 overflow-x-hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold font-heading">Events</h1>
            <p className="text-sm text-muted-foreground truncate">
              Create and manage your events
            </p>
          </div>
        </div>
        <Card className="rounded-2xl border-destructive/50">
          <CardContent className="flex flex-col items-center gap-4 py-16 px-6" role="alert">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-bold">Something went wrong</p>
              <p className="text-sm text-muted-foreground max-w-[320px]">
                We couldn&apos;t load your events right now. Please try again in a moment.
              </p>
            </div>
            <Link href="/dashboard/events">
              <Button variant="outline" className="mt-2 min-h-[44px]">
                Try again
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 overflow-x-hidden max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-heading">Events</h1>
          <p className="text-sm text-muted-foreground truncate">
            Create and manage your events
          </p>
        </div>
        <Link href="/dashboard/events/new" className="shrink-0">
          <Button className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200 min-h-[44px] min-w-[44px]">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </Link>
      </div>

      {collectiveIds.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-nocturn/10">
              <Users className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-bold">No collective yet</p>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                Join or create a collective to start planning events.
              </p>
            </div>
            <Link href="/onboarding">
              <Button className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200 mt-2 min-h-[44px]">
                <Plus className="mr-2 h-4 w-4" />
                Create a Collective
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
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
              <Button className="bg-nocturn hover:bg-nocturn-light active:scale-95 transition-all duration-200 mt-2 min-h-[44px]">
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Event
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {published.length > 0 && (
            <CollapsibleEventSection
              title="Published"
              events={published}
              dotColor="bg-emerald-500"
              defaultOpen={true}
            />
          )}
          {drafts.length > 0 && (
            <CollapsibleEventSection
              title="Drafts"
              events={drafts}
              dotColor="bg-yellow-500"
              defaultOpen={false}
            />
          )}
          {past.length > 0 && (
            <CollapsibleEventSection
              title="Past"
              events={past}
              dotColor="bg-zinc-500"
              muted
              defaultOpen={false}
            />
          )}
          {cancelled.length > 0 && (
            <CollapsibleEventSection
              title="Cancelled"
              events={cancelled}
              dotColor="bg-red-500"
              muted
              defaultOpen={false}
            />
          )}
        </div>
      )}

      {/* AI Event Suggestions */}
      {suggestions.length > 0 && (
        <EventSuggestions suggestions={suggestions} />
      )}
    </div>
  );
}
