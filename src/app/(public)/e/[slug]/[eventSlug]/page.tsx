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
    <div className="min-h-screen bg-[#09090B] antialiased selection:bg-purple-500/20" style={{ scrollBehavior: "smooth" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ═══ SCENE 1: THE ARRIVAL — full-screen immersive hero ═══ */}
      <div className="relative min-h-[85vh] sm:min-h-[90vh] flex flex-col justify-end overflow-hidden">
        {/* Background layer */}
        {event.flyer_url ? (
          <>
            <Image
              src={event.flyer_url}
              alt={event.title}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/60 to-[#09090B]/20" />
          </>
        ) : (
          <>
            {/* Cinematic gradient — not a placeholder, a mood */}
            <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, ${accentColor}18 0%, transparent 70%)` }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 80% 70%, ${accentColor}0c 0%, transparent 50%)` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-[#09090B]/40" />
            {/* Grain */}
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`, backgroundSize: "128px 128px" }} />
          </>
        )}

        {/* Content overlay — bottom-aligned */}
        <div className="relative z-10 px-6 pb-10 sm:pb-14 mx-auto max-w-[640px] w-full space-y-5">
          {/* Collective badge */}
          <div className="flex items-center gap-2">
            {collective.logo_url ? (
              <Image src={collective.logo_url} alt={collective.name} width={24} height={24} className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: accentColor }}>
                {collective.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[13px] text-white/60 font-medium">{collective.name}</span>
          </div>

          {/* Title — cinematic scale */}
          <h1 className="font-heading text-[3.2rem] sm:text-[5rem] font-black tracking-[-0.05em] text-white leading-[0.9]">
            {event.title}
          </h1>

          {/* Essential info — date, time, venue — one glance */}
          <div className="flex flex-wrap items-center gap-x-2 text-[15px] text-white/60 font-medium">
            <span>{dayName} {monthName} {dayNum}</span>
            <span className="text-white/20">·</span>
            <span>{startTime}</span>
            {venue && (
              <>
                <span className="text-white/20">·</span>
                <span>{venue.name}</span>
              </>
            )}
          </div>

          {/* CTA — the most important button on the page */}
          {isUpcoming && tiers && tiers.length > 0 && (
            <a
              href="#tickets"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-bold text-white transition-all duration-300 hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: accentColor }}
            >
              {lowestTierPrice === "Free" ? "RSVP — Free" : `Get Tickets — ${lowestTierPrice}`}
            </a>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <div className="w-5 h-8 rounded-full border border-white/15 flex items-start justify-center p-1">
            <div className="w-1 h-2 rounded-full bg-white/30 animate-bounce" />
          </div>
        </div>
      </div>

      {/* ═══ SCENE 2: THE DETAILS — editorial layout ═══ */}
      <div className="mx-auto max-w-[640px] px-6">

        {/* Social proof bar */}
        {(ticketsSold ?? 0) > 0 && (
          <div className="py-6 flex items-center justify-between border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1.5">
                {[...Array(Math.min(ticketsSold ?? 0, 5))].map((_, i) => (
                  <div
                    key={i}
                    className="h-6 w-6 rounded-full ring-[1.5px] ring-[#09090B]"
                    style={{ background: `linear-gradient(135deg, ${accentColor}${50 + i * 10}, ${accentColor}${25 + i * 8})` }}
                  />
                ))}
              </div>
              <span className="text-[13px] text-white/40">
                <span className="text-white font-semibold">{ticketsSold}</span> going
              </span>
            </div>
            <SellingFastBadge soldPercent={soldPercent} />
          </div>
        )}

        {/* The hook — first sentence, large */}
        {event.description && (
          <div className="py-10">
            <p className="text-[19px] sm:text-[22px] leading-[1.5] text-white/60 font-light max-w-[95%]">
              {event.description.split(".")[0]}.
            </p>
          </div>
        )}

        {/* Countdown */}
        {isUpcoming && (
          <div className="pb-10">
            <EventCountdown targetDate={event.doors_at || event.starts_at} />
          </div>
        )}

        {/* ═══ WHEN ═══ */}
        <div className="py-8 border-t border-white/[0.04]">
          <div className="flex items-center gap-6">
            {/* Giant date */}
            <div className="text-center min-w-[72px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">{monthName}</p>
              <p className="font-heading text-[3.5rem] font-black text-white leading-[0.85]">{dayNum}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">{dayName}</p>
            </div>
            <div className="h-16 w-px bg-white/[0.06]" />
            <div className="space-y-1">
              <p className="text-xl text-white font-heading font-bold">{startTime}{endTime ? ` — ${endTime}` : ""}</p>
              {doorsTime && <p className="text-[13px] text-white/35">Doors at {doorsTime}</p>}
              {minAge && <p className="text-[13px] text-white/35">{minAge}+ only</p>}
            </div>
          </div>
        </div>

        {/* ═══ WHERE ═══ */}
        {venue && (
          <div className="py-8 border-t border-white/[0.04]">
            <div className="rounded-2xl overflow-hidden border border-white/[0.04]">
              <div className="relative h-40 w-full">
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}&zoom=15&maptype=roadmap`}
                  className="h-full w-full border-0 opacity-60 grayscale contrast-[1.15] saturate-0"
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Map of ${venue.name}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-[#09090B]/30 pointer-events-none" />
              </div>
              <div className="px-5 pb-5 -mt-10 relative z-10">
                <p className="font-heading text-2xl font-bold text-white">{venue.name}</p>
                <p className="text-[13px] text-white/35 mt-1">
                  {venue.address}{venue.address && venue.city ? ", " : ""}{venue.city}
                </p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-semibold transition-colors hover:text-white"
                    style={{ color: accentColor }}>
                    <Navigation className="h-3.5 w-3.5" />
                    Get directions
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ THE STORY ═══ */}
        {(event.description && event.description.includes(".")) && (
          <div className="py-8 border-t border-white/[0.04]">
            <ExpandableText text={event.description} />
          </div>
        )}

        {/* Host message */}
        {hostMessage && (
          <div className="py-8 border-t border-white/[0.04]">
            <div className="flex gap-4">
              <div className="w-[2px] rounded-full shrink-0" style={{ background: `linear-gradient(180deg, ${accentColor}, transparent)` }} />
              <div>
                <p className="text-[16px] text-white/50 leading-[1.7] italic">&ldquo;{hostMessage}&rdquo;</p>
                <div className="flex items-center gap-2 mt-3">
                  {collective.logo_url ? (
                    <Image src={collective.logo_url} alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="h-5 w-5 rounded-full text-[8px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: accentColor }}>
                      {collective.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-[12px] text-white/30 font-medium">{collective.name}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {dressCode && (
          <div className="py-4 border-t border-white/[0.04]">
            <p className="text-[13px] text-white/25"><span className="text-white/40">Dress code</span> — {dressCode}</p>
          </div>
        )}

        {/* ═══ LINEUP ═══ */}
        {artists && artists.length > 0 && (
          <div className="py-8 border-t border-white/[0.04]">
            <div className="relative">
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
                {artists.map((a: { artist_id: string; set_time: string | null; artists: unknown }) => {
                  const artist = a.artists as unknown as { name: string; genre: string | null };
                  return (
                    <div
                      key={a.artist_id}
                      className="flex-none rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 min-w-[150px] space-y-2.5 hover:border-white/[0.12] transition-all duration-300"
                    >
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${accentColor}15` }}
                      >
                        <Music className="h-5 w-5" style={{ color: accentColor }} />
                      </div>
                      <p className="font-heading text-sm font-bold text-white tracking-tight">
                        {artist.name}
                      </p>
                      {artist.genre && (
                        <span
                          className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide"
                          style={{
                            backgroundColor: `${accentColor}12`,
                            color: `${accentColor}cc`,
                          }}
                        >
                          {artist.genre}
                        </span>
                      )}
                      {a.set_time && (
                        <p className="text-[11px] text-white/30 font-medium">{a.set_time}</p>
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

          {/* ═══ TICKETS ═══ */}
          {isUpcoming && tiers && tiers.length > 0 && (
            <div id="tickets" className="py-10 border-t border-white/[0.04]">
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

          {/* ═══ REACTIONS ═══ */}
          <div className="py-8 border-t border-white/[0.04]">
            <EventReactions eventId={event.id} initialCounts={reactionCounts} />
          </div>

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

      </div>

      {/* Sticky ticket CTA — appears when scrolled past tickets */}
      {isUpcoming && tiers && tiers.length > 0 && (
        <StickyTicketBar
          lowestPrice={lowestTierPrice}
          accentColor={accentColor}
          ticketSectionId="tickets"
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
