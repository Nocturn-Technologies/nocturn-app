import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { Calendar, Clock, MapPin, Navigation, Music } from "lucide-react";
import { TicketSection } from "@/components/public-event/ticket-section";
import { ShareButton } from "@/components/public-event/share-button";
import { PublicEventShareCard } from "@/components/public-event/public-event-share-card";
import { ExpandableText } from "@/components/public-event/expandable-text";
import { EventCountdown, SellingFastBadge } from "@/components/public-event/event-countdown";
import { GoingCounter } from "@/components/public-event/going-counter";
import { HostMessage } from "@/components/public-event/host-message";
import { EventReactions } from "@/components/public-event/event-reactions";
import { CollectiveProfile } from "@/components/public-event/collective-profile";
import { PastEvents } from "@/components/public-event/past-events";
import { StickyTicketBar } from "@/components/public-event/sticky-ticket-bar";
import { AlsoThisWeek } from "@/components/public-event/also-this-week";
import type { Metadata } from "next";
import Image from "next/image";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import Link from "next/link";

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
    .maybeSingle();

  if (!collective) return { title: "Event Not Found" };

  const { data: event } = await supabase
    .from("events")
    .select("title, description, flyer_url, starts_at, venues(name, city)")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .maybeSingle();

  if (!event) return { title: "Event Not Found" };

  const title = `${event.title} | ${collective.name} — Nocturn`;
  const description = event.description || `Event by ${collective.name}`;
  const appUrl = "https://app.trynocturn.com";
  const canonicalUrl = `${appUrl}/e/${slug}/${eventSlug}`;

  // Use flyer if available, otherwise generate dynamic OG image
  const venue = event.venues as unknown as { name: string; city: string } | null;
  const dateStr = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
    : "";
  // Only use flyer_url for OG if it's a real URL (not a base64 data URL)
  const flyerIsValidUrl = event.flyer_url && event.flyer_url.startsWith("http");
  const ogImageUrl = flyerIsValidUrl
    ? event.flyer_url
    : `${appUrl}/og-image/event?${new URLSearchParams({
      title: event.title,
      collective: collective.name,
      date: dateStr,
      venue: venue ? `${venue.name}, ${venue.city}` : "",
    }).toString()}`;

  return {
    title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
      url: canonicalUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: event.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const supabase = createAdminClient();

  // Fetch collective (include description for profile section)
  const { data: collective } = await supabase
    .from("collectives")
    .select("id, name, slug, logo_url, instagram, description")
    .eq("slug", slug)
    .maybeSingle();

  if (!collective) notFound();

  // Fetch event with venue + metadata
  const { data: event } = await supabase
    .from("events")
    .select("*, venues(name, address, city, capacity)")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .maybeSingle();

  if (!event || event.status === "draft") notFound();

  // Fetch all supplementary data in parallel (7 queries → 1 round-trip)
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: tiers },
    { count: ticketsSold },
    { data: artists },
    { data: reactionRows },
    { count: collectiveEventCount },
    { data: pastEvents },
    { data: nearbyEvents },
    { data: tierTickets },
  ] = await Promise.all([
    supabase.from("ticket_tiers").select("*").eq("event_id", event.id).order("sort_order"),
    supabase.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", event.id).in("status", ["paid", "checked_in"]),
    supabase.from("event_artists").select("artist_id, set_time, artists(name, genre)").eq("event_id", event.id).eq("status", "confirmed").order("set_time"),
    supabase.from("event_reactions").select("emoji").eq("event_id", event.id),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("collective_id", collective.id).in("status", ["published", "completed"]),
    supabase.from("events").select("title, slug, flyer_url, starts_at").eq("collective_id", collective.id).eq("status", "completed").neq("id", event.id).order("starts_at", { ascending: false }).limit(6),
    supabase.from("events")
      .select("title, slug, flyer_url, starts_at, collective_id, collectives(name, slug), venues(name, city)")
      .eq("status", "published")
      .neq("id", event.id)
      .neq("collective_id", collective.id)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", weekFromNow)
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase.from("tickets").select("ticket_tier_id").eq("event_id", event.id).in("status", ["paid", "checked_in"]),
  ]);

  // Compute per-tier sold counts for accurate "remaining" display
  const tierSoldCounts: Record<string, number> = {};
  for (const t of tierTickets || []) {
    tierSoldCounts[t.ticket_tier_id] = (tierSoldCounts[t.ticket_tier_id] || 0) + 1;
  }

  const totalCapacity = (tiers || []).reduce((s, t) => s + (t.capacity || 0), 0);
  const soldPercent = totalCapacity > 0 ? Math.round(((ticketsSold ?? 0) / totalCapacity) * 100) : 0;

  const reactionCounts: Record<string, number> = {};
  for (const r of reactionRows || []) {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
  }

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

  // Theme color from metadata or default nocturn purple
  const metadata = (event.metadata ?? {}) as Record<string, string>;
  const accentColor = metadata.themeColor || "#7B2FF7";

  // Formatted date pieces
  const dayName = eventDate.toLocaleDateString("en", { weekday: "short" }).toUpperCase();
  const monthName = eventDate.toLocaleDateString("en", { month: "short" }).toUpperCase();
  const dayNum = eventDate.getDate();

  const startTime = eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  const endTime = endsAt ? endsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }) : null;
  const doorsTime = doorsAt ? doorsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }) : null;

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://nocturn.app"}/e/${slug}/${eventSlug}`;
  const mapsUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}` : null;

  // Dress code / min age / host message from metadata
  const dressCode = metadata.dressCode || null;
  const hostMessage = metadata.hostMessage || null;
  const minAge = event.min_age as number | null;
  const vibeTags = (event.vibe_tags ?? []) as string[];

  // Share card data
  const shareCardDate = `${dayName} ${monthName} ${dayNum} \u2022 ${startTime}`;
  const shareCardVenue = venue ? `${venue.name} \u2022 ${venue.city}` : "";
  const lowestTierPrice = tiers && tiers.length > 0
    ? `$${Math.min(...tiers.map((t) => Number(t.price)))}+`
    : "Free";

  // JSON-LD structured data for search engines
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || `Event by ${collective.name}`,
    startDate: event.starts_at,
    ...(event.ends_at && { endDate: event.ends_at }),
    ...(event.doors_at && { doorTime: event.doors_at }),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(event.flyer_url && { image: event.flyer_url }),
    url: publicUrl,
    organizer: {
      "@type": "Organization",
      name: collective.name,
      url: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${slug}`,
    },
    ...(venue && {
      location: {
        "@type": "Place",
        name: venue.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: venue.address,
          addressLocality: venue.city,
        },
      },
    }),
    ...(tiers && tiers.length > 0 && {
      offers: tiers.map((t) => ({
        "@type": "Offer",
        name: t.name,
        price: Number(t.price).toFixed(2),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: publicUrl,
      })),
    }),
  };

  return (
    <div className="min-h-screen bg-[#09090B] antialiased" style={{ scrollBehavior: "smooth" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ─── Hero Section ─── */}
      <div className="relative">
        {event.flyer_url ? (
          <div className="relative aspect-[4/5] max-h-[520px] w-full sm:aspect-[16/9] sm:max-h-[480px]">
            <Image
              src={event.flyer_url}
              alt={event.title}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 640px) 100vw, 640px"
            />
            {/* Bottom gradient fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/40 to-transparent" />
          </div>
        ) : (
          /* Premium gradient hero — no flyer */
          <div className="relative h-80 w-full sm:h-[420px] overflow-hidden">
            {/* Layered gradient mesh */}
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${accentColor}25 0%, transparent 50%)` }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 20%, ${accentColor}15 0%, transparent 60%)` }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 80%, ${accentColor}10 0%, transparent 50%)` }} />
            {/* Grain texture */}
            <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`, backgroundSize: "128px 128px" }} />
            {/* Bottom fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/50 to-transparent" />
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
          </div>
        )}
      </div>

      {/* ─── Content ─── */}
      <div className="mx-auto max-w-[640px] px-6 pb-32 sm:pb-12">
        <div className="-mt-20 relative space-y-10">
          {/* ─── Collective badge + Title ─── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              {collective.logo_url ? (
                <Image
                  src={collective.logo_url}
                  alt={collective.name}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-white/10"
                />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white/10"
                  style={{ backgroundColor: accentColor }}
                >
                  {collective.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-white/50">
                {collective.name}
              </span>
            </div>

            <h1 className="font-heading text-4xl font-extrabold tracking-[-0.03em] text-white sm:text-6xl line-clamp-3 leading-[1.05]">
              {event.title}
            </h1>

            {/* Vibe tags + selling fast badge */}
            <div className="flex flex-wrap items-center gap-2">
              {vibeTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60"
                >
                  {tag}
                </span>
              ))}
              <SellingFastBadge soldPercent={soldPercent} />
            </div>

            {/* Going counter */}
            <GoingCounter count={ticketsSold ?? 0} accentColor={accentColor} />
          </div>

          {/* ─── Live Countdown ─── */}
          {isUpcoming && (
            <EventCountdown targetDate={event.doors_at || event.starts_at} />
          )}

          {/* ─── Date & Time Card ─── */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5">
            <div className="flex items-center gap-5">
              {/* Big date block */}
              <div className="flex flex-col items-center rounded-xl bg-white/[0.04] border border-white/[0.06] px-5 py-3 min-w-[76px]">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  {dayName}
                </span>
                <span className="font-heading text-2xl font-bold text-white">
                  {dayNum}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                  {monthName}
                </span>
              </div>
              {/* Time info */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-white/30" />
                  <span className="font-heading text-lg font-semibold text-white">
                    {startTime}
                    {endTime && ` — ${endTime}`}
                  </span>
                </div>
                {doorsTime && (
                  <p className="text-sm text-white/40">
                    Doors open at {doorsTime}
                  </p>
                )}
                {minAge && (
                  <p className="text-sm text-white/40">
                    {minAge}+ only
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Venue Section ─── */}
          {venue && (
            <div className="space-y-3">
              <h2 className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
                Venue
              </h2>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
                {/* Google Maps Embed */}
                <div className="relative h-44 w-full bg-white/[0.03]">
                  <iframe
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}&zoom=15&maptype=roadmap`}
                    className="h-full w-full border-0 opacity-80 grayscale"
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${venue.name}`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-transparent pointer-events-none" />
                </div>

                <div className="p-5 space-y-4">
                  {/* Venue name + address */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nocturn/20">
                      <MapPin className="h-5 w-5 text-nocturn" />
                    </div>
                    <div>
                      <p className="font-heading text-lg font-bold text-white">
                        {venue.name}
                      </p>
                      <p className="text-sm text-white/50">
                        {venue.address}{venue.address && venue.city ? ", " : ""}{venue.city}
                      </p>
                    </div>
                  </div>

                  {/* Venue details */}
                  {venue.capacity && (
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                        <span className="text-xs text-white/40">Capacity</span>
                        <span className="text-xs font-semibold text-white">{venue.capacity}</span>
                      </div>
                    </div>
                  )}

                  {/* Directions button */}
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl border border-nocturn/30 bg-nocturn/10 px-4 py-3 text-sm font-semibold text-nocturn transition-colors hover:bg-nocturn/20"
                    >
                      <Navigation className="h-4 w-4" />
                      Get Directions
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── About / Description ─── */}
          {event.description && (
            <div className="space-y-3">
              <h2 className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
                About
              </h2>
              <ExpandableText text={event.description} />
            </div>
          )}

          {/* Dress code */}
          {dressCode && (
            <div className="space-y-2">
              <h2 className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
                Dress Code
              </h2>
              <p className="text-[15px] text-white/70">{dressCode}</p>
            </div>
          )}

          {/* ─── Host Message ─── */}
          {hostMessage && (
            <HostMessage
              message={hostMessage}
              hostName={collective.name}
              hostAvatarUrl={collective.logo_url}
              accentColor={accentColor}
            />
          )}

          {/* ─── Lineup ─── */}
          {artists && artists.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
                Lineup
              </h2>
              {/* Horizontal scroll on mobile with fade indicator */}
              <div className="relative">
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
                {artists.map((a: { artist_id: string; set_time: string | null; artists: unknown }) => {
                  const artist = a.artists as unknown as { name: string; genre: string | null };
                  return (
                    <div
                      key={a.artist_id}
                      className="flex-none rounded-2xl border border-white/5 bg-white/[0.02] p-4 min-w-[140px] space-y-1.5"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
                        <Music className="h-5 w-5 text-white/30" />
                      </div>
                      <p className="font-heading text-sm font-semibold text-white">
                        {artist.name}
                      </p>
                      {artist.genre && (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${accentColor}20`,
                            color: accentColor,
                          }}
                        >
                          {artist.genre}
                        </span>
                      )}
                      {a.set_time && (
                        <p className="text-xs text-white/40">{a.set_time}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Right fade indicator */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#09090B] to-transparent" />
              </div>
            </div>
          )}

          {/* ─── Tickets ─── */}
          {isUpcoming && tiers && tiers.length > 0 && (
            <div id="ticket-section">
              <TicketSection
                tiers={tiers.map((t) => ({
                  id: t.id,
                  name: t.name,
                  price: Number(t.price),
                  capacity: t.capacity,
                  sold: tierSoldCounts[t.id] || 0,
                  remaining: t.capacity - (tierSoldCounts[t.id] || 0),
                }))}
                eventId={event.id}
                accentColor={accentColor}
              />
            </div>
          )}

          {/* ─── Guest Reactions ─── */}
          <EventReactions eventId={event.id} initialCounts={reactionCounts} />

          {/* Status banners */}
          {event.status === "cancelled" && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-center">
              <p className="font-heading text-lg font-semibold text-red-400">
                This event has been cancelled.
              </p>
            </div>
          )}

          {event.status === "completed" && (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-center">
              <p className="font-heading text-lg font-semibold text-white/50">
                This event has ended. Thanks for coming!
              </p>
            </div>
          )}

          {/* ─── Share ─── */}
          <ShareButton url={publicUrl} title={event.title} />

          {/* ─── Share Card ─── */}
          <PublicEventShareCard
            event={{
              title: event.title,
              date: shareCardDate,
              venue: shareCardVenue,
              price: lowestTierPrice,
              flyerUrl: event.flyer_url,
              publicUrl,
            }}
            accentColor={accentColor}
          />

          {/* ─── Collective Profile ─── */}
          <CollectiveProfile
            name={collective.name}
            slug={collective.slug}
            description={collective.description ?? null}
            logoUrl={collective.logo_url}
            instagram={collective.instagram}
            eventCount={collectiveEventCount ?? 0}
            accentColor={accentColor}
          />

          {/* ─── Past Events ─── */}
          <PastEvents
            events={(pastEvents || []).map((e) => ({
              title: e.title,
              slug: e.slug,
              flyerUrl: e.flyer_url,
              startsAt: e.starts_at,
            }))}
            collectiveSlug={collective.slug}
            collectiveName={collective.name}
          />

          {/* ─── Footer ─── */}
          <div className="border-t border-white/5 pt-8 pb-4 text-center">
            <Link
              href="https://nocturn.app"
              className="text-xs text-white/30 transition-colors hover:text-white/50"
            >
              Powered by{" "}
              <span className="inline-flex items-center gap-1">
                <span>🌙</span>
                <span className="font-semibold text-white">
                  nocturn.
                </span>
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky ticket CTA — appears when scrolled past tickets */}
      {isUpcoming && tiers && tiers.length > 0 && (
        <StickyTicketBar
          lowestPrice={lowestTierPrice}
          accentColor={accentColor}
          ticketSectionId="ticket-section"
        />
      )}

      {/* Cross-promotion: other events happening soon */}
      <AlsoThisWeek
        events={(nearbyEvents || []).map((e) => {
          const c = e.collectives as unknown as { name: string; slug: string };
          const v = e.venues as unknown as { name: string; city: string } | null;
          return {
            title: e.title,
            slug: e.slug,
            collectiveSlug: c?.slug || "",
            collectiveName: c?.name || "",
            startsAt: e.starts_at,
            flyerUrl: e.flyer_url,
            venueName: v?.name || null,
            venueCity: v?.city || null,
          };
        })}
      />

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#09090B] px-6 py-8">
        <div className="mx-auto max-w-[640px] flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-white/30">
            <span className="text-sm">🌙</span>
            <span className="text-xs font-semibold tracking-wide">nocturn.</span>
          </div>
          <div className="flex gap-4 text-[11px] text-white/25">
            <Link href="/legal/terms" className="hover:text-white/40 transition-colors">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-white/40 transition-colors">Privacy</Link>
            <a href="https://trynocturn.com" target="_blank" rel="noopener" className="hover:text-white/40 transition-colors">About</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
