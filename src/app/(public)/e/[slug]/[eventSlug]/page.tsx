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
import { createAdminClient } from "@/lib/supabase/config";
import { DEFAULT_TIMEZONE } from "@/lib/utils";
import { trackEventPageView } from "@/lib/analytics";
import Link from "next/link";

// Revalidate public event pages every 60 seconds (ISR)
// Visitors get instant cached pages, data refreshes in background
export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
  searchParams: Promise<{ ref?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const supabase = createAdminClient();

  const { data: collectiveRaw } = await supabase
    .from("collectives")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  const collective = collectiveRaw as { id: string; name: string } | null;

  if (!collective) return { title: "Event Not Found" };

  const { data: eventRaw } = await supabase
    .from("events")
    .select("title, description, flyer_url, starts_at, venues(name, city)")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .is("deleted_at", null)
    .maybeSingle();
  const event = eventRaw as { title: string; description: string | null; flyer_url: string | null; starts_at: string; venues: { name: string; city: string } | null } | null;

  if (!event) return { title: "Event Not Found" };

  const title = `${event.title} | ${collective.name} — Nocturn`;
  const description = event.description || `Event by ${collective.name}`;
  const appUrl = "https://app.trynocturn.com";
  const canonicalUrl = `${appUrl}/e/${slug}/${eventSlug}`;

  // Use flyer if available, otherwise generate dynamic OG image
  const venue = event.venues;
  const dateStr = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
    : "";
  // Only use flyer_url for OG if it's a real URL (not a base64 data URL)
  const flyerIsValidUrl = event.flyer_url && event.flyer_url.startsWith("http");
  const ogImageUrl = flyerIsValidUrl
    ? event.flyer_url!
    : `${appUrl}/og-image/event?${new URLSearchParams({
      title: event.title,
      collective: collective.name,
      date: dateStr,
      venue: venue ? `${venue.name}, ${venue.city}` : "",
      price: "Tickets Available",
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

export default async function PublicEventPage({ params, searchParams }: Props) {
  const { slug, eventSlug } = await params;
  const slugFormat = /^[a-z0-9-]+$/i;
  if (!slugFormat.test(slug) || !slugFormat.test(eventSlug)) {
    notFound();
  }
  const { ref: referrerToken } = await searchParams;
  const supabase = createAdminClient();

  // Fetch collective (include description for profile section)
  const { data: collectiveRaw2 } = await supabase
    .from("collectives")
    .select("id, name, slug, logo_url, instagram, description")
    .eq("slug", slug)
    .maybeSingle();
  const collective = collectiveRaw2 as { id: string; name: string; slug: string; logo_url: string | null; instagram: string | null; description: string | null } | null;

  if (!collective) notFound();

  // Fetch event with venue + metadata
  const { data: eventRaw2 } = await supabase
    .from("events")
    .select("id, title, slug, description, starts_at, ends_at, doors_at, status, flyer_url, vibe_tags, min_age, metadata, collective_id, venues(name, address, city, capacity)")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .is("deleted_at", null)
    .maybeSingle();
  const event = eventRaw2 as { id: string; title: string; slug: string; description: string | null; starts_at: string; ends_at: string | null; doors_at: string | null; status: string; flyer_url: string | null; vibe_tags: string[] | null; min_age: number | null; metadata: Record<string, string> | null; collective_id: string; venues: { name: string; address: string; city: string; capacity: number } | null } | null;

  if (!event || event.status === "draft") notFound();

  // Track page view (non-blocking — never delays the render)
  trackEventPageView(event.id);

  // Fetch all supplementary data in parallel (7 queries → 1 round-trip)
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: tiersRaw },
    { count: ticketsSold },
    { data: artistsRaw },
    { data: reactionRowsRaw },
    { count: collectiveEventCount },
    { data: pastEventsRaw },
    { data: nearbyEventsRaw },
    { data: tierTicketsRaw },
  ] = await Promise.all([
    supabase.from("ticket_tiers").select("*").eq("event_id", event.id).order("sort_order"),
    supabase.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", event.id).in("status", ["paid", "checked_in"]),
    supabase.from("event_artists").select("artist_id, set_time, artists(name, genre)").eq("event_id", event.id).eq("status", "confirmed").order("set_time"),
    supabase.from("event_reactions").select("emoji").eq("event_id", event.id),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("collective_id", collective.id).in("status", ["published", "completed"]).is("deleted_at", null),
    supabase.from("events").select("title, slug, flyer_url, starts_at").eq("collective_id", collective.id).eq("status", "completed").neq("id", event.id).is("deleted_at", null).order("starts_at", { ascending: false }).limit(6),
    supabase.from("events")
      .select("title, slug, flyer_url, starts_at, collective_id, collectives(name, slug), venues(name, city)")
      .eq("status", "published")
      .neq("id", event.id)
      .neq("collective_id", collective.id)
      .is("deleted_at", null)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", weekFromNow)
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase.from("tickets").select("ticket_tier_id").eq("event_id", event.id).in("status", ["paid", "checked_in"]),
  ]);

  const tiers = tiersRaw as { id: string; name: string; price: number; capacity: number; sort_order: number }[] | null;
  const artists = artistsRaw as { artist_id: string; set_time: string | null; artists: { name: string; genre: string | null } | null }[] | null;
  const reactionRows = reactionRowsRaw as { emoji: string }[] | null;
  const pastEvents = pastEventsRaw as { title: string; slug: string; flyer_url: string | null; starts_at: string }[] | null;
  const nearbyEvents = nearbyEventsRaw as { title: string; slug: string; flyer_url: string | null; starts_at: string; collective_id: string; collectives: { name: string; slug: string } | null; venues: { name: string; city: string } | null }[] | null;
  const tierTickets = tierTicketsRaw as { ticket_tier_id: string }[] | null;

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

  const venue = event.venues;

  const eventDate = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const doorsAt = event.doors_at ? new Date(event.doors_at) : null;
  const isUpcoming = eventDate >= new Date() && event.status === "published";

  // Theme color from metadata or default nocturn purple
  const metadata = event.metadata ?? {};
  const rawAccent = metadata.themeColor || "#7B2FF7";
  const accentColor = /^#[0-9a-fA-F]{3,8}$/.test(rawAccent) ? rawAccent : "#7B2FF7";

  // Use event's stored timezone, fall back to default
  const tz = (metadata.timezone as string) || DEFAULT_TIMEZONE;
  const dayName = eventDate.toLocaleDateString("en", { weekday: "short", timeZone: tz }).toUpperCase();
  const monthName = eventDate.toLocaleDateString("en", { month: "short", timeZone: tz }).toUpperCase();
  const dayNum = parseInt(eventDate.toLocaleDateString("en", { day: "numeric", timeZone: tz }));

  const startTime = eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const endTime = endsAt ? endsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz }) : null;
  const doorsTime = doorsAt ? doorsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz }) : null;

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${slug}/${eventSlug}`;
  const mapsUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}` : null;

  // Dress code / min age / host message from metadata
  const dressCode = metadata.dressCode || null;
  const hostMessage = metadata.hostMessage || null;
  const minAge = event.min_age;
  const vibeTags = event.vibe_tags ?? [];

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* ═══ SCENE 1: THE POSTER — raw, asymmetric, bold ═══ */}
      <div className="relative min-h-screen flex items-end overflow-hidden">
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
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/50 to-[#09090B]/10" />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${accentColor}30 0%, #09090B 50%, #0a0a12 100%)` }} />
            {/* Asymmetric glow shapes */}
            <div className="absolute -top-[20%] -right-[15%] w-[70vw] h-[70vw] rounded-full blur-[60px]" style={{ background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)` }} />
            <div className="absolute bottom-[10%] -left-[20%] w-[50vw] h-[50vw] rounded-full blur-[80px]" style={{ background: `radial-gradient(circle, ${accentColor}10 0%, transparent 60%)` }} />
            {/* Grain */}
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`, backgroundSize: "128px 128px" }} />
          </>
        )}

        {/* Giant date watermark — top right */}
        <div className="absolute top-6 right-6 sm:right-12 z-10 text-right select-none pointer-events-none">
          <div className="font-heading text-[8rem] sm:text-[12rem] font-black leading-[0.8] text-white/[0.05] tracking-[-0.05em]">
            {String(dayNum).padStart(2, "0")}
          </div>
          <div className="text-[14px] font-bold tracking-[0.5em] uppercase" style={{ color: accentColor }}>
            {monthName}
          </div>
        </div>

        {/* Content — bottom-aligned, asymmetric */}
        <div className="relative z-10 w-full px-5 sm:px-12 pb-12 pt-40">
          {/* Collective pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 border border-white/[0.08] rounded-full backdrop-blur-sm mb-6">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/40">
              {collective.name}
            </span>
          </div>

          {/* Title — massive, poster-scale */}
          <h1 className="font-heading text-[clamp(3.5rem,12vw,8rem)] font-black tracking-[-0.05em] text-white leading-[0.85] max-w-[85%] mb-8">
            {event.title.split(" ").map((word: string, i: number, arr: string[]) => {
              // Color the last word/number with accent
              const isLast = i === arr.length - 1;
              const isNumber = /\d/.test(word) || /^[IVXLC]+\.?$/.test(word);
              return (
                <span key={i}>
                  {isLast || isNumber ? (
                    <span style={{ color: accentColor }}>{word}</span>
                  ) : (
                    word
                  )}
                  {i < arr.length - 1 ? " " : ""}
                </span>
              );
            })}
          </h1>

          {/* Info bar — utilitarian, separated by borders */}
          <div className="flex flex-wrap gap-0 mb-6">
            <div className="pr-5 sm:pr-6 border-r border-white/[0.06] py-1">
              <div className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/20 mb-1">Date</div>
              <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{dayName} {monthName} {dayNum}</div>
            </div>
            {doorsTime && (
              <div className="px-5 sm:px-6 border-r border-white/[0.06] py-1">
                <div className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/20 mb-1">Doors</div>
                <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{doorsTime}</div>
              </div>
            )}
            <div className="px-5 sm:px-6 border-r border-white/[0.06] py-1">
              <div className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/20 mb-1">Show</div>
              <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{startTime}{endTime ? ` — ${endTime}` : ""}</div>
            </div>
            {venue && (
              <div className="pl-5 sm:pl-6 py-1">
                <div className="text-[9px] font-bold tracking-[0.3em] uppercase text-white/20 mb-1">Venue</div>
                <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{venue.name}{venue.city ? `, ${venue.city}` : ""}</div>
              </div>
            )}
          </div>

          {/* Vibe tags */}
          {vibeTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {vibeTags.map((tag) => (
                <span key={tag} className="text-[10px] font-semibold tracking-[0.15em] uppercase px-3.5 py-1.5 border border-white/[0.06] rounded-full text-white/30">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA — full-width on mobile */}
          {isUpcoming && tiers && tiers.length > 0 && (
            <a
              href="#tickets"
              className="inline-flex items-center justify-center gap-2.5 w-full sm:w-auto px-10 py-[18px] rounded-[14px] text-[16px] font-bold text-white transition-all duration-300 hover:brightness-[1.15] hover:translate-y-[-2px] active:scale-[0.98] max-w-[400px]"
              style={{ backgroundColor: accentColor }}
            >
              {lowestTierPrice === "Free" ? "RSVP — Free" : `Get Tickets — ${lowestTierPrice}`}
              <span className="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </a>
          )}
        </div>
      </div>

      {/* Floating "going" badge */}
      {(ticketsSold ?? 0) > 0 && (
        <div className="fixed bottom-20 right-4 z-40 flex items-center gap-2 px-4 py-2.5 bg-[#09090B]/85 backdrop-blur-xl border border-white/[0.08] rounded-full text-[13px] text-white/50">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span><span className="text-white font-semibold">{ticketsSold}</span> going</span>
        </div>
      )}

      {/* ═══ SCENE 2: THE STORY — below the fold ═══ */}
      <div className="mx-auto max-w-[640px] px-6">

        {/* Countdown — only if upcoming */}
        {isUpcoming && (
          <div className="py-8 border-b border-white/[0.04]">
            <EventCountdown targetDate={event.doors_at || event.starts_at} />
          </div>
        )}

        {/* ═══ WHERE — brutalist venue card ═══ */}
        {venue && (
          <div className="py-8 border-t border-white/[0.04]">
            <div className="rounded-[20px] overflow-hidden border border-white/[0.06] bg-white/[0.015]">
              <div className="relative h-40 w-full">
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}&zoom=15&maptype=roadmap`}
                  className="h-full w-full border-0 opacity-50 grayscale contrast-[1.2] saturate-0"
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Map of ${venue.name}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e12] via-transparent to-[#09090B]/40 pointer-events-none" />
                <div className="absolute bottom-3 left-4 text-[10px] font-semibold tracking-[0.2em] uppercase text-white/20 px-2.5 py-1 border border-white/[0.08] rounded">MAP</div>
              </div>
              <div className="px-6 py-5">
                <p className="font-heading text-[24px] font-bold text-white">{venue.name}</p>
                <p className="text-[14px] text-white/30 mt-1">
                  {venue.address}{venue.address && venue.city ? ", " : ""}{venue.city}
                </p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-[13px] font-semibold transition-colors hover:text-white"
                    style={{ color: accentColor }}>
                    <Navigation className="h-3.5 w-3.5" />
                    Get directions &rarr;
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ THE STORY ═══ */}
        {event.description && event.description.trim().length > 0 && (
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
                    <Image src={collective.logo_url} alt={collective.name || "Collective logo"} width={20} height={20} className="h-5 w-5 rounded-full" />
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
                {artists.map((a) => {
                  const artist = a.artists;
                  if (!artist) return null;
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
                  remaining: Math.max(0, t.capacity - (tierSoldCounts[t.id] || 0)),
                }))}
                eventId={event.id}
                accentColor={accentColor}
                referrerToken={referrerToken}
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

          {/* ─── Share + About ─── */}
          <div className="space-y-6 py-8 border-t border-white/[0.04]">
            <ShareButton url={publicUrl} title={event.title} />

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

            <CollectiveProfile
              name={collective.name}
              slug={collective.slug}
              description={collective.description ?? null}
              logoUrl={collective.logo_url}
              instagram={collective.instagram}
              eventCount={collectiveEventCount ?? 0}
              accentColor={accentColor}
            />
          </div>

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
          const c = e.collectives;
          const v = e.venues;
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
        city={venue?.city || undefined}
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
