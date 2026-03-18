import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Music,
  Pencil,
  DollarSign,
  Users,
  Ticket,
  ScanLine,
  ListChecks,
  Tag,
  ClipboardList,
  BarChart3,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { EventStatusActions } from "./event-status-actions";

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

  // Verify user owns this event via collective membership
  const { data: memberships } = await supabase
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  if (collectiveIds.length === 0) notFound();

  // Fetch event with venue
  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, starts_at, ends_at, doors_at, status, flyer_url, collective_id, venues(name, address, city, capacity)"
    )
    .eq("id", eventId)
    .single();

  if (!event || !collectiveIds.includes(event.collective_id)) notFound();

  // Get collective slug for public link
  const { data: collective } = await supabase
    .from("collectives")
    .select("slug, name")
    .eq("id", event.collective_id)
    .single();

  // Fetch ticket tiers
  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("id, name, price, capacity, sort_order")
    .eq("event_id", eventId)
    .order("sort_order");

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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold truncate">{event.title}</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusInfo.color}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotColor}`}
              />
              {statusInfo.label}
            </span>
          </div>
          {collective && (
            <p className="text-sm text-muted-foreground">{collective.name}</p>
          )}
        </div>
      </div>

      {/* Status Actions */}
      <EventStatusActions eventId={event.id} status={event.status} />

      {/* Quick Links */}
      <div className="flex flex-wrap gap-2">
        {event.status === "draft" && (
          <Link href={`/dashboard/events/${event.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-3 w-3" />
              Edit Event
            </Button>
          </Link>
        )}
        <Link href={`/dashboard/events/${event.id}/tasks`}>
          <Button variant="outline" size="sm" className="border-nocturn/30 text-nocturn hover:bg-nocturn/10">
            <ListChecks className="mr-2 h-3 w-3" />
            Playbook
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/lineup`}>
          <Button variant="outline" size="sm">
            <Music className="mr-2 h-3 w-3" />
            Manage Lineup
          </Button>
        </Link>
        {(event.status === "published" || event.status === "upcoming") && (
          <Link href={`/dashboard/events/${event.id}/check-in`}>
            <Button variant="outline" size="sm">
              <ScanLine className="mr-2 h-3 w-3" />
              Check-in Scanner
            </Button>
          </Link>
        )}
        <Link href={`/dashboard/events/${event.id}/promos`}>
          <Button variant="outline" size="sm">
            <Tag className="mr-2 h-3 w-3" />
            Promos
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/guests`}>
          <Button variant="outline" size="sm">
            <ClipboardList className="mr-2 h-3 w-3" />
            Guest List
          </Button>
        </Link>
        <Link href={`/dashboard/events/${event.id}/forecast`}>
          <Button variant="outline" size="sm" className="border-nocturn-teal/30 text-nocturn-teal hover:bg-nocturn-teal/10">
            <BarChart3 className="mr-2 h-3 w-3" />
            Forecast
          </Button>
        </Link>
        {(event.status === "completed" || event.status === "settled") && (
          <Link href={`/dashboard/events/${event.id}/recap`}>
            <Button variant="outline" size="sm" className="border-nocturn-amber/30 text-nocturn-amber hover:bg-nocturn-amber/10">
              <FileText className="mr-2 h-3 w-3" />
              Recap
            </Button>
          </Link>
        )}
        {publicUrl && (
          <Link href={publicUrl} target="_blank">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-2 h-3 w-3" />
              View Public Page
            </Button>
          </Link>
        )}
      </div>

      <Separator />

      {/* Event Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-nocturn" />
            Event Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date & Time */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                {eventDate.toLocaleDateString("en", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
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
              <div>
                <p className="font-medium">{venue.name}</p>
                <p className="text-muted-foreground">
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
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {event.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Tiers */}
      {tiers && tiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-nocturn" />
              Ticket Tiers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{tier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <Users className="mr-1 inline h-3 w-3" />
                      {tier.capacity} available
                    </p>
                  </div>
                  <span className="flex items-center text-sm font-semibold text-nocturn">
                    <DollarSign className="h-3.5 w-3.5" />
                    {Number(tier.price).toFixed(2)}
                  </span>
                </div>
              ))}
              {/* Summary */}
              <div className="flex justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">Total capacity</span>
                <span className="font-medium">
                  {tiers.reduce((sum, t) => sum + (t.capacity ?? 0), 0)} tickets
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flyer Preview */}
      {event.flyer_url && (
        <Card>
          <CardHeader>
            <CardTitle>Event Flyer</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="h-48 rounded-lg bg-cover bg-center"
              style={{ backgroundImage: `url(${event.flyer_url})` }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
