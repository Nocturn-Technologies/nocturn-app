import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  MapPin,
  Users,
  Calendar,
  Sparkles,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/config";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCollectiveRecentEvents } from "@/app/actions/discover-collectives";
import { PitchCollabButton } from "./pitch-collab-button";

export const dynamic = "force-dynamic";

interface CollectiveRow {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  logo_url: string | null;
  cover_url: string | null;
  city: string | null;
  created_at: string;
}

export default async function CollectiveDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = createAdminClient();

  const { data: collective } = await sb
    .from("collectives")
    .select("id, name, slug, bio, logo_url, cover_url, city, created_at")
    .eq("slug", slug)
    .maybeSingle<CollectiveRow>();

  if (!collective) notFound();

  // Fetch viewer's collective id for Pitch a collab button
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let myCollectiveId: string | undefined;
  let isOwnCollective = false;
  if (user) {
    const { data: membership } = await sb
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    myCollectiveId = (membership as { collective_id?: string } | null)?.collective_id;
    isOwnCollective = myCollectiveId === collective.id;
  }

  // Fetch collective stats + recent events in parallel
  const [memberCountResult, recentEvents] = await Promise.all([
    sb
      .from("collective_members")
      .select("user_id", { count: "exact", head: true })
      .eq("collective_id", collective.id)
      .is("deleted_at", null),
    getCollectiveRecentEvents(collective.id, 5),
  ]);

  const memberCount = memberCountResult.count ?? 0;
  const heroFlyer = recentEvents[0]?.flyer_url ?? collective.cover_url ?? null;
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const recentEventCount = recentEvents.filter((e) => {
    const t = new Date(e.starts_at).getTime();
    return !Number.isNaN(t) && t >= sixtyDaysAgo;
  }).length;

  return (
    <div className="max-w-4xl mx-auto space-y-4 overflow-x-hidden px-4 md:px-0">
      {/* Back */}
      <Link
        href="/dashboard/discover?tab=collectives"
        className="inline-flex items-center gap-1.5 min-h-[44px] text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Discover
      </Link>

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-border bg-card">
        <div className="relative h-48 md:h-64 bg-gradient-to-br from-nocturn/30 via-nocturn/10 to-background">
          {heroFlyer && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={heroFlyer}
              alt={collective.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          {recentEventCount > 0 && (
            <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-sm px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-300">
                {recentEventCount} event{recentEventCount === 1 ? "" : "s"} · last 60d
              </span>
            </div>
          )}
        </div>
        <div className="relative -mt-16 px-4 md:px-6 pb-5">
          <div className="flex items-end gap-4">
            <div className="h-20 w-20 md:h-24 md:w-24 shrink-0 rounded-2xl overflow-hidden ring-4 ring-background bg-nocturn/20 flex items-center justify-center">
              {collective.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={collective.logo_url}
                  alt={collective.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-black font-heading text-nocturn">
                  {collective.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 pb-1">
              <span className="inline-block rounded-full bg-nocturn/15 text-nocturn px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider mb-1">
                Collective
              </span>
              <h1 className="text-2xl md:text-3xl font-bold font-heading leading-tight truncate">
                {collective.name}
              </h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                {collective.city && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{collective.city}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {recentEvents.length}+ {recentEvents.length === 1 ? "event" : "events"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA row */}
      {!isOwnCollective && (
        <PitchCollabButton
          myCollectiveId={myCollectiveId}
          targetCollectiveId={collective.id}
          targetName={collective.name}
        />
      )}

      {/* Bio */}
      {collective.bio && (
        <Card>
          <CardContent className="p-4 md:p-5 space-y-2">
            <h2 className="text-sm font-bold font-heading">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {collective.bio}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent events strip */}
      {recentEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold font-heading flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-nocturn" />
              Recent events
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {recentEvents.length} shown
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
            {recentEvents.map((event) => (
              <RecentEventTile key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Socials — contact methods are now in party_contact_methods; shown if available */}
    </div>
  );
}

function RecentEventTile({
  event,
}: {
  event: {
    id: string;
    title: string;
    flyer_url: string | null;
    starts_at: string;
    venue_name: string | null;
  };
}) {
  const date = new Date(event.starts_at);
  const isPast = date.getTime() < Date.now();
  const dateLabel = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card group relative">
      <div className="relative aspect-[3/4] bg-gradient-to-br from-nocturn/30 to-background">
        {event.flyer_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={event.flyer_url}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-nocturn/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-[11px] text-white font-semibold leading-tight line-clamp-2">
            {event.title}
          </p>
          <p className="text-[11px] text-white/70 mt-0.5 truncate">
            {dateLabel}
            {event.venue_name ? ` · ${event.venue_name}` : ""}
          </p>
        </div>
        {!isPast && (
          <span className="absolute top-2 right-2 rounded-full bg-emerald-500/30 backdrop-blur-sm border border-emerald-400/40 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
            Upcoming
          </span>
        )}
      </div>
    </div>
  );
}
