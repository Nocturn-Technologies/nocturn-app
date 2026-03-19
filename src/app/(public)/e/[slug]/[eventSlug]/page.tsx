import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, MapPin } from "lucide-react";
import { TicketPurchase } from "@/components/ticket-purchase";
import type { Metadata } from "next";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const supabase = createAdminClient();

  const { data: collective } = await supabase
    .from("collectives")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!collective) return { title: "Event Not Found" };

  const { data: event } = await supabase
    .from("events")
    .select("title, description, flyer_url")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .single();

  if (!event) return { title: "Event Not Found" };

  const title = `${event.title} | ${collective.name} — Nocturn`;
  const description = event.description || `Event by ${collective.name}`;
  const canonicalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://nocturn.app"}/e/${slug}/${eventSlug}`;

  return {
    title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
      url: canonicalUrl,
      ...(event.flyer_url && { images: [{ url: event.flyer_url, width: 1200, height: 630, alt: event.title }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      ...(event.flyer_url && { images: [event.flyer_url] }),
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const supabase = createAdminClient();

  // Fetch collective
  const { data: collective } = await supabase
    .from("collectives")
    .select("id, name, slug, logo_url, instagram")
    .eq("slug", slug)
    .single();

  if (!collective) notFound();

  // Fetch event with venue
  const { data: event } = await supabase
    .from("events")
    .select("*, venues(name, address, city, capacity)")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .single();

  if (!event || event.status === "draft") notFound();

  // Fetch ticket tiers
  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("*")
    .eq("event_id", event.id)
    .order("sort_order");

  // Fetch lineup
  const { data: artists } = await supabase
    .from("event_artists")
    .select("artist_id, set_time, artists(name, genre)")
    .eq("event_id", event.id)
    .eq("status", "confirmed")
    .order("set_time");

  const venue = event.venues as unknown as {
    name: string;
    address: string;
    city: string;
    capacity: number;
  } | null;

  const eventDate = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const doorsAt = event.doors_at ? new Date(event.doors_at) : null;
  const isUpcoming = eventDate >= new Date() && event.status === "published";

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative">
        {event.flyer_url ? (
          <div
            className="h-64 bg-cover bg-center sm:h-80"
            style={{ backgroundImage: `url(${event.flyer_url})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        ) : (
          <div className="h-48 bg-gradient-to-br from-nocturn/30 via-nocturn/10 to-nocturn-glow/10 sm:h-64">
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-12">
        {/* Event info */}
        <div className="-mt-12 relative space-y-4">
          {/* Collective badge */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nocturn text-xs font-bold text-white">
              {collective.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              {collective.name}
            </span>
          </div>

          <h1 className="text-3xl font-bold sm:text-4xl">{event.title}</h1>

          {/* Date & Time */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-nocturn" />
              {eventDate.toLocaleDateString("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-nocturn" />
              {doorsAt && `Doors ${doorsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })} · `}
              Start {eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
              {endsAt && ` · End ${endsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`}
            </span>
          </div>

          {/* Venue */}
          {venue && (
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-nocturn" />
              <div>
                <p className="font-medium text-foreground">{venue.name}</p>
                <p>
                  {venue.address}, {venue.city}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <p className="text-muted-foreground leading-relaxed">
              {event.description}
            </p>
          )}

          {/* Lineup */}
          {artists && artists.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Lineup
                </h2>
                <div className="space-y-2">
                  {artists.map((a: { artist_id: string; set_time: string | null; artists: unknown }) => {
                    const artist = a.artists as unknown as { name: string; genre: string | null };
                    return (
                      <div
                        key={a.artist_id}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium">{artist.name}</p>
                          {artist.genre && (
                            <p className="text-xs text-muted-foreground">
                              {artist.genre}
                            </p>
                          )}
                        </div>
                        {a.set_time && (
                          <span className="text-xs text-muted-foreground">
                            {a.set_time}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ticket tiers + purchase */}
          {isUpcoming && tiers && tiers.length > 0 && (
            <TicketPurchase
              tiers={tiers.map((t) => ({
                id: t.id,
                name: t.name,
                price: Number(t.price),
                capacity: t.capacity,
              }))}
              eventId={event.id}
            />
          )}

          {event.status === "cancelled" && (
            <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
              This event has been cancelled.
            </div>
          )}

          {event.status === "completed" && (
            <div className="rounded-lg bg-muted p-4 text-center text-muted-foreground">
              This event has ended. Thanks for coming!
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Powered by{" "}
              <span className="font-semibold text-nocturn">nocturn.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
