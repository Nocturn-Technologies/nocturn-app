import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { safeBgUrl } from "@/lib/utils";
import { notFound } from "next/navigation";
import { EventCreatedToast } from "@/components/events/event-created-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Music,
  Pencil,
  Users,
  Ticket,
  ScanLine,
  ListChecks,
  Tag,
  ClipboardList,
  FileText,
  Palette,
  Coffee,
  RotateCcw,
  Share2,
  MessageSquare,
  Sheet,
} from "lucide-react";
import Link from "next/link";
import { EventStatusActions } from "./event-status-actions";
import { LiveModeBanner } from "./live-mode-banner";
import { EventShareCard } from "./event-share-card";
// EventCreatedToast imported from shared components
import { ExternalTicketsForm } from "./external-tickets";
import { getExternalTicketData } from "@/app/actions/external-tickets";
import { TicketTierEditor } from "@/components/ticket-tier-editor";
import { LiveTicketStats } from "@/components/events/live-ticket-stats";
import { EventUpdatesComposer } from "@/components/events/event-updates-composer";
import { listEventUpdatesPublic } from "@/app/actions/event-updates";
import { RsvpLiveList } from "@/components/events/rsvp-live-list";
import { listEventRsvps } from "@/app/actions/rsvps";

interface Props {
  params: Promise<{ eventId: string }>;
}

const statusConfig: Record<
  string,
  { label: string; color: string; dotColor: string }
> = {
  draft: {
    label: "Draft",
    color: "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20",
    dotColor: "bg-yellow-500",
  },
  published: {
    label: "Published",
    color: "bg-green-500/10 text-green-500 ring-green-500/20",
    dotColor: "bg-green-500",
  },
  upcoming: {
    label: "Upcoming",
    color: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
    dotColor: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    color: "bg-muted text-muted-foreground ring-border",
    dotColor: "bg-muted-foreground",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-500/10 text-red-500 ring-red-500/20",
    dotColor: "bg-red-500",
  },
  settled: {
    label: "Settled",
    color: "bg-nocturn/10 text-nocturn ring-nocturn/20",
    dotColor: "bg-nocturn",
  },
};

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  // Use admin client to bypass RLS
  const admin = createAdminClient();

  // Verify user owns this event via collective membership
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  if (collectiveIds.length === 0) notFound();

  // Fetch event with venue
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, slug, description, starts_at, ends_at, doors_at, status, flyer_url, collective_id, venues(name, address, city, capacity)"
    )
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!event || !collectiveIds.includes(event.collective_id)) notFound();

  // Get collective slug for public link
  const { data: collective } = await admin
    .from("collectives")
    .select("slug, name")
    .eq("id", event.collective_id)
    .maybeSingle();

  // Fetch ticket tiers with sold counts
  const { data: rawTiers } = await admin
    .from("ticket_tiers")
    .select("id, name, price, capacity, sort_order")
    .eq("event_id", eventId)
    .order("sort_order");

  // Get sold ticket counts per tier
  let tierSoldCounts: Record<string, number> = {};
  if (rawTiers && rawTiers.length > 0) {
    const tierIds = rawTiers.map((t) => t.id);
    const { data: soldData } = await admin
      .from("tickets")
      .select("ticket_tier_id")
      .in("ticket_tier_id", tierIds)
      .in("status", ["paid", "checked_in"]);

    if (soldData) {
      for (const ticket of soldData) {
        if (!ticket.ticket_tier_id) continue;
        tierSoldCounts[ticket.ticket_tier_id] =
          (tierSoldCounts[ticket.ticket_tier_id] ?? 0) + 1;
      }
    }
  }

  const tiers = rawTiers?.map((t) => ({
    ...t,
    price: Number(t.price),
    sold: tierSoldCounts[t.id] ?? 0,
  })) ?? [];

  // Get check-in count for progress bar
  const { count: checkedInCount } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "checked_in");

  // Get refunded/disputed ticket count
  const { count: refundedCount } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "refunded");

  // Get disputed ticket count
  const { count: disputedCount } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "cancelled")
    .filter("metadata->>disputed", "eq", "true");

  // Fetch task progress for playbook
  const { data: taskStats } = await admin
    .from("event_tasks")
    .select("status")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const taskTotal = taskStats?.length ?? 0;
  const taskDone = taskStats?.filter((t: { status: string | null }) => t.status === "done").length ?? 0;
  const taskPercent = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  // Fetch existing updates for the composer
  const { updates: existingUpdates } = await listEventUpdatesPublic(eventId);

  // Fetch RSVPs (with contact info — only visible to collective members)
  const { rsvps: initialRsvps } = await listEventRsvps(eventId);

  const venue = event.venues as unknown as {
    name: string;
    address: string;
    city: string;
    capacity: number;
  } | null;

  const eventDate = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const doorsAt = event.doors_at ? new Date(event.doors_at) : null;
  const statusInfo = statusConfig[event.status] ?? statusConfig.draft;
  const publicUrl =
    collective && event.status !== "draft"
      ? `/e/${collective.slug}/${event.slug}`
      : null;

  const fullPublicUrl = publicUrl
    ? `${process.env.NEXT_PUBLIC_APP_URL || "https://nocturn.app"}${publicUrl}`
    : null;

  // Format date for share card
  const dayName = eventDate.toLocaleDateString("en", { weekday: "short" }).toUpperCase();
  const monthName = eventDate.toLocaleDateString("en", { month: "short" }).toUpperCase();
  const dayNum = eventDate.getDate();
  const timeStr = eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  const shareCardDate = `${dayName} ${monthName} ${dayNum} \u2022 ${timeStr}`;
  const shareCardVenue = venue ? `${venue.name} \u2022 ${venue.city}` : "";
  const lowestPrice = tiers && tiers.length > 0
    ? `$${Math.min(...tiers.map((t) => Number(t.price)))}+`
    : "Free";

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-500">
      <EventCreatedToast />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon" className="shrink-0 min-h-[44px] min-w-[44px] hover:bg-accent active:scale-95 transition-all duration-200" aria-label="Back to events">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-heading truncate">{event.title}</h1>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusInfo.color}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotColor}`}
              />
              {statusInfo.label}
            </span>
          </div>
          {collective && (
            <p className="text-sm text-muted-foreground truncate">{collective.name}</p>
          )}
        </div>
      </div>

      {/* Live Mode Banner */}
      <LiveModeBanner
        eventId={event.id}
        startsAt={event.starts_at}
        endsAt={event.ends_at}
      />

      {/* Status Actions */}
      <EventStatusActions eventId={event.id} status={event.status} />

      {/* Dispute Warning */}
      {(disputedCount ?? 0) > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-400">
              {disputedCount} ticket{disputedCount !== 1 ? "s" : ""} disputed
            </p>
            <p className="text-xs text-red-400/70">
              Check your Stripe dashboard for dispute details and response deadlines.
            </p>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="flex flex-wrap gap-2">
        {event.status === "draft" && (
          <Link href={`/dashboard/events/${event.id}/edit`}>
            <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
              <Pencil className="mr-2 h-3 w-3" />
              Edit Event
            </Button>
          </Link>
        )}
        <Link href={`/dashboard/events/${event.id}/design`}>
          <Button variant="outline" size="sm" className="min-h-[44px] border-nocturn-glow/30 text-nocturn-glow hover:bg-nocturn-glow/10 active:scale-95 transition-all duration-200">
            <Palette className="mr-2 h-3 w-3" />
            Design
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/tasks`}>
          <Button variant="outline" size="sm" className="min-h-[44px] border-nocturn/30 text-nocturn hover:bg-nocturn/10 active:scale-95 transition-all duration-200">
            <ListChecks className="mr-2 h-3 w-3" />
            Playbook
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/lineup`}>
          <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
            <Music className="mr-2 h-3 w-3" />
            Manage Lineup
          </Button>
        </Link>
        {(event.status === "published" || event.status === "upcoming") && (
          <Link href={`/dashboard/events/${event.id}/check-in`}>
            <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
              <ScanLine className="mr-2 h-3 w-3" />
              Check-in Scanner
            </Button>
          </Link>
        )}
        <Link href={`/dashboard/events/${event.id}/promos`}>
          <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
            <Tag className="mr-2 h-3 w-3" />
            Promos
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/guests`}>
          <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
            <ClipboardList className="mr-2 h-3 w-3" />
            Guest List
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/chat`}>
          <Button variant="outline" size="sm" className="min-h-[44px] border-nocturn/30 text-nocturn hover:bg-nocturn/10 active:scale-95 transition-all duration-200">
            <MessageSquare className="mr-2 h-3 w-3" />
            Chat
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/refunds`}>
          <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
            <RotateCcw className="mr-2 h-3 w-3" />
            Refunds
          </Button>
        </Link>
{/* Referrals — gated for MVP, restore post-launch */}
        <Link href={`/dashboard/events/${event.id}/financials`}>
          <Button variant="outline" size="sm" className="min-h-[44px] border-green-400/30 text-green-400 hover:bg-green-400/10 active:scale-95 transition-all duration-200">
            <Sheet className="mr-2 h-3 w-3" />
            Financials
          </Button>
        </Link>
        {(event.status === "completed" || event.status === "settled") && (
          <>
            <Link href={`/dashboard/events/${event.id}/recap`}>
              <Button variant="outline" size="sm" className="min-h-[44px] border-nocturn-amber/30 text-nocturn-amber hover:bg-nocturn-amber/10 active:scale-95 transition-all duration-200">
                <FileText className="mr-2 h-3 w-3" />
                Recap
              </Button>
            </Link>
            <Link href={`/dashboard/events/${event.id}/wrap`}>
              <Button variant="outline" size="sm" className="min-h-[44px] border-nocturn/30 text-nocturn hover:bg-nocturn/10 active:scale-95 transition-all duration-200">
                <Coffee className="mr-2 h-3 w-3" />
                View Wrap
              </Button>
            </Link>
          </>
        )}
        {publicUrl && (
          <Link href={publicUrl} target="_blank">
            <Button variant="outline" size="sm" className="min-h-[44px] hover:bg-accent active:scale-95 transition-all duration-200">
              <ExternalLink className="mr-2 h-3 w-3" />
              View Public Page
            </Button>
          </Link>
        )}
        {fullPublicUrl && (
          <EventShareCard
            event={{
              title: event.title,
              date: shareCardDate,
              venue: shareCardVenue,
              price: lowestPrice,
              flyerUrl: event.flyer_url,
              publicUrl: fullPublicUrl,
            }}
          />
        )}
      </div>

      {/* Playbook Progress */}
      {taskTotal > 0 && (
        <Link href={`/dashboard/events/${event.id}/tasks`}>
          <div className="rounded-2xl border border-border p-4 hover:border-nocturn/20 transition-all active:scale-[0.98]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-nocturn" /> Playbook Progress
              </span>
              <span className="text-sm font-bold text-nocturn">{taskPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-nocturn transition-all duration-500" style={{ width: `${taskPercent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{taskDone} of {taskTotal} tasks complete</p>
          </div>
        </Link>
      )}

      <Separator />

      {/* Event Details */}
      <Card className="rounded-2xl border-border hover:border-nocturn/20 transition-all duration-200">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-4 w-4 text-nocturn" />
            Event Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date & Time */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {eventDate.toLocaleDateString("en", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {doorsAt &&
                  `Doors ${doorsAt.toLocaleTimeString("en", {
                    hour: "numeric",
                    minute: "2-digit",
                  })} · `}
                Start{" "}
                {eventDate.toLocaleTimeString("en", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {endsAt &&
                  ` · End ${endsAt.toLocaleTimeString("en", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`}
              </span>
            </div>
          </div>

          {/* Venue */}
          {venue && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium truncate">{venue.name}</p>
                <p className="text-muted-foreground truncate">
                  {venue.address}, {venue.city}
                </p>
                {venue.capacity && (
                  <p className="text-muted-foreground">
                    <Users className="mr-1 inline h-3 w-3" />
                    Capacity: {venue.capacity}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="rounded-xl bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
                {event.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Tiers — Inline Editor */}
      <Card className="rounded-2xl border-border hover:border-nocturn/20 transition-all duration-200">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Ticket className="h-4 w-4 text-nocturn" />
            Ticket Tiers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Live ticket sales summary */}
              {tiers.length > 0 && (
                <div className="mb-3">
                  <LiveTicketStats
                    eventId={event.id}
                    initialSold={tiers.reduce((sum, t) => sum + (t.sold || 0), 0)}
                    initialCapacity={tiers.reduce((sum, t) => sum + (t.capacity ?? 0), 0)}
                    initialRevenue={tiers.reduce((sum, t) => sum + ((t.sold || 0) * Number(t.price)), 0)}
                    initialCheckedIn={checkedInCount ?? 0}
                  />
                </div>
              )}
          {(refundedCount ?? 0) > 0 && (
            <p className="text-xs text-zinc-500 mt-1 mb-3">
              {refundedCount} ticket{refundedCount !== 1 ? "s" : ""} refunded
            </p>
          )}
          <TicketTierEditor eventId={event.id} initialTiers={tiers} />
        </CardContent>
      </Card>

      {/* External Ticket Data */}
      <ExternalTicketsFormWrapper eventId={event.id} />

      {/* RSVPs — live updates from the public page */}
      <Card className="rounded-2xl border-border hover:border-nocturn/20 transition-all duration-200">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-4 w-4 text-nocturn" />
            RSVPs
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RsvpLiveList eventId={event.id} initialRsvps={initialRsvps} />
        </CardContent>
      </Card>

      {/* Updates Composer — Post announcements to attendees */}
      <EventUpdatesComposer eventId={event.id} initialUpdates={existingUpdates} />

      {/* Flyer Preview */}
      {event.flyer_url && (
        <Card className="rounded-2xl overflow-hidden border-border hover:border-nocturn/20 transition-all duration-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold">Event Flyer</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="h-48 md:h-64 rounded-xl bg-cover bg-center transition-all duration-200 hover:scale-[1.01]"
              style={{ backgroundImage: safeBgUrl(event.flyer_url) }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function ExternalTicketsFormWrapper({ eventId }: { eventId: string }) {
  const data = await getExternalTicketData(eventId);
  return <ExternalTicketsForm eventId={eventId} initial={data} />;
}
