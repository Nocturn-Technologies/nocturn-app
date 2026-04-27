import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { TicketSection } from "@/components/public-event/ticket-section";
import { ShareButton } from "@/components/public-event/share-button";
import { PublicEventShareCard } from "@/components/public-event/public-event-share-card";
import { ExpandableText } from "@/components/public-event/expandable-text";
import { EventCountdown } from "@/components/public-event/event-countdown";
import { EventReactions } from "@/components/public-event/event-reactions";
import { CollectiveProfile } from "@/components/public-event/collective-profile";
import { PastEvents } from "@/components/public-event/past-events";
import { StickyTicketBar } from "@/components/public-event/sticky-ticket-bar";
import { AlsoThisWeek } from "@/components/public-event/also-this-week";
import { RsvpWidget } from "@/components/public-event/rsvp-widget";
import { PublicRsvpList } from "@/components/public-event/public-rsvp-list";
import { EventUpdatesFeed } from "@/components/public-event/event-updates-feed";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getRsvpCounts, getMyRsvp, getRsvpByToken, listPublicEventRsvps } from "@/app/actions/rsvps";
import { listEventUpdatesPublic } from "@/app/actions/event-updates";
import type { Metadata } from "next";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/config";
import { DEFAULT_TIMEZONE } from "@/lib/utils";
import { trackEventPageView } from "@/lib/analytics";
import Link from "next/link";

// Revalidate public event pages every 10 seconds (ISR)
export const revalidate = 10;

function buildCalendarUrl(event: { title: string; starts_at: string; ends_at: string | null; description: string | null; }, venueName?: string) {
  const start = new Date(event.starts_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = event.ends_at
    ? new Date(event.ends_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
    : new Date(new Date(event.starts_at).getTime() + 4 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description ?? "",
    location: venueName ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
  /** `ref` = referral param, `rsvp` = access token from email confirmation link */
  searchParams: Promise<{ ref?: string; rsvp?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // TODO(audit): slug format regex is only applied in PublicEventPage at line ~100. generateMetadata runs on every crawler hit with unbounded slug values. Add /^[a-z0-9-]{1,80}$/i validation here too.
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
    .select("title, description, flyer_url, starts_at, venue_name, city")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .maybeSingle();
  const eventRowMeta = eventRaw as { title: string; description: string | null; flyer_url: string | null; starts_at: string; venue_name: string | null; city: string | null } | null;
  const event = eventRowMeta
    ? {
        ...eventRowMeta,
        venues: eventRowMeta.venue_name
          ? { name: eventRowMeta.venue_name, city: eventRowMeta.city ?? "" }
          : null,
      }
    : null;

  if (!event) return { title: "Event Not Found" };

  const title = `${event.title} | ${collective.name} — Nocturn`;
  const description = event.description || `Event by ${collective.name}`;
  const appUrl = "https://app.trynocturn.com";
  const canonicalUrl = `${appUrl}/e/${slug}/${eventSlug}`;

  const venue = event.venues;
  const dateStr = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
    : "";
  const flyerIsValidUrl = event.flyer_url && event.flyer_url.startsWith("http");
  const ogParams: Record<string, string> = {
    title: event.title,
    collective: collective.name,
    date: dateStr,
    venue: venue ? `${venue.name}, ${venue.city}` : "",
    price: "Tickets Available",
  };
  if (flyerIsValidUrl) {
    ogParams.flyer = event.flyer_url!;
  }
  const ogImageUrl = `${appUrl}/og-image/event?${new URLSearchParams(ogParams).toString()}`;

  return {
    title,
    description,
    metadataBase: new URL(appUrl),
    openGraph: {
      title: event.title,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "Nocturn",
      locale: "en_US",
      images: [
        {
          url: ogImageUrl,
          secureUrl: ogImageUrl,
          width: 1200,
          height: 630,
          alt: event.title,
          type: "image/png",
        },
      ],
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
    other: {
      "og:image:width": "1200",
      "og:image:height": "630",
    },
  };
}

export default async function PublicEventPage({ params, searchParams }: Props) {
  const { slug, eventSlug } = await params;
  const slugFormat = /^[a-z0-9-]+$/i;
  if (!slugFormat.test(slug) || !slugFormat.test(eventSlug)) {
    notFound();
  }
  const { ref: referrerToken, rsvp: rsvpToken } = await searchParams;
  const supabase = createAdminClient();

  // Fetch collective.
  const { data: collectiveRaw2 } = await supabase
    .from("collectives")
    .select("id, name, slug, logo_url, bio")
    .eq("slug", slug)
    .maybeSingle();
  const collective = collectiveRaw2 as { id: string; name: string; slug: string; logo_url: string | null; bio: string | null } | null;

  if (!collective) notFound();

  // Fetch event.
  const { data: eventRaw2 } = await supabase
    .from("events")
    .select("id, title, slug, description, starts_at, ends_at, doors_at, status, flyer_url, vibe_tags, min_age, metadata, collective_id, is_free, venue_name, venue_address, city, capacity")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .maybeSingle();
  const eventRow = eventRaw2 as { id: string; title: string; slug: string; description: string | null; starts_at: string; ends_at: string | null; doors_at: string | null; status: string; flyer_url: string | null; vibe_tags: string[] | null; min_age: number | null; metadata: Record<string, string> | null; collective_id: string; is_free: boolean | null; venue_name: string | null; venue_address: string | null; city: string | null; capacity: number | null } | null;

  if (!eventRow || eventRow.status === "draft") notFound();

  const event = {
    ...eventRow,
    venues: eventRow.venue_name
      ? { name: eventRow.venue_name, address: eventRow.venue_address ?? "", city: eventRow.city ?? "", capacity: eventRow.capacity ?? 0 }
      : null,
  };

  // Track page view (non-blocking — never delays the render)
  trackEventPageView(event.id);

  // Fetch all supplementary data in parallel
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: tiersRaw },
    { count: ticketsSold },
    { data: artistsRaw },
    { count: collectiveEventCount },
    { data: pastEventsRaw },
    { data: nearbyEventsRaw },
    { data: tierTicketsRaw },
    { data: pendingTierTicketsRaw },
  ] = await Promise.all([
    supabase.from("ticket_tiers").select("*").eq("event_id", event.id).order("sort_order"),
    supabase.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", event.id).in("status", ["paid", "checked_in"]),
    supabase
      .from("event_artists")
      .select("id, name, set_time, party_id, artist_profiles:party_id(genre)")
      .eq("event_id", event.id)
      .order("set_time"),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("collective_id", collective.id).in("status", ["published", "completed"]),
    supabase.from("events").select("title, slug, flyer_url, starts_at").eq("collective_id", collective.id).eq("status", "completed").neq("id", event.id).order("starts_at", { ascending: false }).limit(6),
    supabase.from("events")
      .select("title, slug, flyer_url, starts_at, collective_id, venue_name, city, collectives(name, slug)")
      .eq("status", "published")
      .neq("id", event.id)
      .neq("collective_id", collective.id)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", weekFromNow)
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase.from("tickets").select("ticket_tier_id").eq("event_id", event.id).in("status", ["paid", "checked_in"]),
    supabase.from("tickets").select("ticket_tier_id").eq("event_id", event.id).eq("status", "pending").gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
  ]);

  const tiers = tiersRaw as { id: string; name: string; price: number; capacity: number; sort_order: number }[] | null;
  const artistsRawTyped = artistsRaw as { id: string; name: string | null; set_time: string | null; party_id: string | null; artist_profiles: { genre: string[] | null } | null }[] | null;
  const artists = artistsRawTyped
    ? artistsRawTyped.map((row) => ({
        artist_id: row.party_id ?? row.id,
        set_time: row.set_time,
        artists: row.name ? { name: row.name, genre: row.artist_profiles?.genre ?? null } : null,
      }))
    : null;
  const pastEvents = pastEventsRaw as { title: string; slug: string; flyer_url: string | null; starts_at: string }[] | null;
  const nearbyEventsRawTyped = nearbyEventsRaw as { title: string; slug: string; flyer_url: string | null; starts_at: string; collective_id: string; venue_name: string | null; city: string | null; collectives: { name: string; slug: string } | null }[] | null;
  const nearbyEvents = nearbyEventsRawTyped
    ? nearbyEventsRawTyped.map((row) => ({
        ...row,
        venues: row.venue_name ? { name: row.venue_name, city: row.city ?? "" } : null,
      }))
    : null;
  const tierTickets = tierTicketsRaw as { ticket_tier_id: string }[] | null;
  const pendingTierTickets = pendingTierTicketsRaw as { ticket_tier_id: string }[] | null;

  // Compute per-tier sold counts for accurate "remaining" display
  const tierSoldCounts: Record<string, number> = {};
  for (const t of tierTickets || []) {
    tierSoldCounts[t.ticket_tier_id] = (tierSoldCounts[t.ticket_tier_id] || 0) + 1;
  }
  for (const t of pendingTierTickets || []) {
    tierSoldCounts[t.ticket_tier_id] = (tierSoldCounts[t.ticket_tier_id] || 0) + 1;
  }

  const reactionCounts: Record<string, number> = {};

  // Mode detection (NOC-31)
  const allTiersFree = !!tiers && tiers.length > 0 && tiers.every((t) => Number(t.price) === 0);
  const noTiers = !tiers || tiers.length === 0;
  const isEffectivelyFree = event.is_free === true || allTiersFree || noTiers;
  const eventMode: "ticketed" | "rsvp" = isEffectivelyFree ? "rsvp" : "ticketed";
  const showRsvp = eventMode === "rsvp";
  const showTickets = eventMode === "ticketed";

  // RSVP counts + current user's RSVP + event updates — fetched in parallel
  const [rsvpCountsResult, myRsvpResult, updatesResult, currentUserResult, publicRsvpsResult] = await Promise.all([
    showRsvp ? getRsvpCounts(event.id) : Promise.resolve({ error: null, counts: { yes: 0, maybe: 0, no: 0 } }),
    showRsvp ? getMyRsvp(event.id) : Promise.resolve({ error: null, rsvp: null }),
    listEventUpdatesPublic(event.id),
    (async () => {
      const ssr = await createServerSupabaseClient();
      const { data: { user } } = await ssr.auth.getUser();
      return user;
    })(),
    showRsvp
      ? listPublicEventRsvps(event.id)
      : Promise.resolve({ error: null, rsvps: [] as Awaited<ReturnType<typeof listPublicEventRsvps>>["rsvps"] }),
  ]);
  const rsvpCounts = rsvpCountsResult.counts;
  let myRsvpStatus = myRsvpResult.rsvp?.status ?? null;
  const eventUpdates = updatesResult.updates;
  const isLoggedIn = !!currentUserResult;
  const initialPublicRsvps = publicRsvpsResult.rsvps;

  let viewerPhone: string | null = null;
  let viewerEmail: string | null = null;
  let viewerFullName: string | null = null;
  if (currentUserResult && showRsvp) {
    viewerEmail = currentUserResult.email ?? null;
    const { data: viewerProfile } = await supabase
      .from("users")
      .select("phone, full_name")
      .eq("auth_id", currentUserResult.id)
      .maybeSingle();
    viewerPhone = viewerProfile?.phone ?? null;
    viewerFullName = viewerProfile?.full_name ?? null;
  }

  if (showRsvp && rsvpToken && !myRsvpStatus) {
    const byToken = await getRsvpByToken(event.id, rsvpToken);
    if (byToken.rsvp) {
      myRsvpStatus = byToken.rsvp.status;
      if (!viewerPhone && byToken.rsvp.phone) viewerPhone = byToken.rsvp.phone;
    }
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
  const yearNum = parseInt(eventDate.toLocaleDateString("en", { year: "numeric", timeZone: tz }));
  const month2 = String(eventDate.getUTCMonth() + 1).padStart(2, "0");
  const day2 = String(dayNum).padStart(2, "0");
  const year2 = String(yearNum).slice(-2);

  const startTime = eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const startTime24 = eventDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false });
  const endTime = endsAt ? endsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz }) : null;
  const endTime24 = endsAt ? endsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false }) : null;
  const doorsTime = doorsAt ? doorsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz }) : null;
  const doorsTime24 = doorsAt ? doorsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false }) : null;

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${slug}/${eventSlug}`;

  const dressCode = metadata.dressCode || null;
  const hostMessage = metadata.hostMessage || null;
  const vibeTags = event.vibe_tags ?? [];

  // Share card data
  const shareCardDate = `${dayName} ${monthName} ${dayNum} • ${startTime}`;
  const shareCardVenue = venue ? `${venue.name} • ${venue.city}` : "";
  const lowestTierPrice = isEffectivelyFree
    ? "Free"
    : tiers && tiers.length > 0
      ? `$${Math.min(...tiers.map((t) => Number(t.price)))}+`
      : "Free";

  // Total remaining capacity across tiers (for sticky bar urgency badge)
  const totalRemaining = tiers
    ? tiers.reduce((sum, t) => sum + Math.max(0, t.capacity - (tierSoldCounts[t.id] || 0)), 0)
    : 0;

  // Collective initials for stamp + watermark
  const collectiveInitials = collective.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || collective.name[0]?.toUpperCase() || "N";
  const heroWatermarkLetter = collectiveInitials[0] ?? "N";

  // Event sequence number — derived from collective event count for stamp
  const eventNumber = String(Math.max(1, collectiveEventCount ?? 1)).padStart(3, "0");

  // Hero countdown footer line
  const tzAbbr = (() => {
    try {
      const formatter = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" });
      const parts = formatter.formatToParts(eventDate);
      return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch {
      return "";
    }
  })();
  const countdownFooter = `${monthName} ${dayNum} · ${startTime}${tzAbbr ? ` ${tzAbbr}` : ""}`;

  // Marquee items
  const topMarqueeItems = [
    ...vibeTags.slice(0, 4).map((t) => t.toLowerCase()),
    ...(artists?.slice(0, 4).map((a) => a.artists?.name).filter((n): n is string => !!n) ?? []),
    venue ? `${venue.city || venue.name}` : null,
    `${dayName} ${monthName} ${dayNum}`,
    typeof ticketsSold === "number" && ticketsSold > 0 ? `${ticketsSold} going` : null,
  ].filter((s): s is string => !!s && s.length > 0);
  const bottomMarqueeItems = [
    "NOCTURN.",
    event.title,
    `${monthName} ${dayNum} · ${yearNum}`,
    venue ? `${venue.name} · ${venue.city || ""}`.replace(/ · $/, "") : null,
    !isEffectivelyFree && lowestTierPrice ? `FROM ${lowestTierPrice}` : null,
    typeof ticketsSold === "number" && ticketsSold > 0 ? `${ticketsSold} GOING` : null,
  ].filter((s): s is string => !!s && s.length > 0);

  const mapsUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}` : null;

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
      offers: tiers.map((t) => {
        const remaining = Math.max(0, t.capacity - (tierSoldCounts[t.id] || 0));
        return {
          "@type": "Offer",
          name: t.name,
          price: Number(t.price).toFixed(2),
          priceCurrency: "USD",
          availability: remaining <= 0
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
          url: publicUrl,
        };
      }),
    }),
  };

  // Section indices (the chapter labels are stable but we skip ones that
  // don't render — e.g. no description, no lineup — so the user only sees
  // the chapters that actually contain content)
  const sections: { key: string; label: string }[] = [];
  if (venue) sections.push({ key: "venue", label: "VENUE" });
  if ((event.description && event.description.trim().length > 0) || hostMessage || dressCode)
    sections.push({ key: "night", label: "THE NIGHT" });
  if (artists && artists.length > 0) sections.push({ key: "lineup", label: "LINEUP" });
  if (isUpcoming && showTickets && tiers && tiers.length > 0) sections.push({ key: "entry", label: "ENTRY" });
  if (isUpcoming && showRsvp) sections.push({ key: "rsvp", label: "RSVP" });
  if (eventUpdates.length > 0) sections.push({ key: "dispatches", label: "DISPATCHES" });
  sections.push({ key: "share", label: "ALSO BY THIS COLLECTIVE" });
  if (nearbyEvents && nearbyEvents.length > 0) sections.push({ key: "alsoweek", label: "ALSO THIS WEEK" });
  const sectionIndex = (key: string) => {
    const idx = sections.findIndex((s) => s.key === key);
    return idx === -1 ? null : String(idx + 1).padStart(2, "0");
  };
  const chapter = (key: string, label: string) => {
    const num = sectionIndex(key);
    return num ? `${num} / ${label}` : label;
  };

  const ctaAnchor = isEffectivelyFree ? "#rsvp" : "#tickets";
  const ctaLabel = isEffectivelyFree ? "RSVP — Free" : `Get tickets — from ${lowestTierPrice}`;

  return (
    <div className="min-h-dvh bg-[#09090B] antialiased selection:bg-purple-500/20 overflow-x-hidden" style={{ scrollBehavior: "smooth" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* ═══ TOP MARQUEE ═══ */}
      {topMarqueeItems.length > 0 && (
        <div className="brutalist-marquee" aria-hidden="true">
          <div className="brutalist-marquee-track">
            {[...topMarqueeItems, ...topMarqueeItems, ...topMarqueeItems, ...topMarqueeItems].map((item, i) => (
              <span key={i}>
                {item} <span style={{ color: accentColor, marginLeft: "1.25rem" }}>◆</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        {/* Background — flyer or gradient */}
        {event.flyer_url ? (
          <>
            <Image
              src={event.flyer_url}
              alt={event.title}
              fill
              className="object-cover opacity-30"
              priority
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#09090B]/70 via-[#09090B]/85 to-[#09090B]" />
          </>
        ) : (
          <>
            <div className="absolute -top-[12%] -left-[12%] w-[55vw] h-[55vw] rounded-full blur-[110px] opacity-[0.22] pointer-events-none" style={{ background: `radial-gradient(circle, ${accentColor}88 0%, transparent 65%)` }} />
            <div className="absolute -bottom-[10%] -right-[10%] w-[40vw] h-[40vw] rounded-full blur-[120px] opacity-[0.18] pointer-events-none" style={{ background: `radial-gradient(circle, ${accentColor}66 0%, transparent 60%)` }} />
          </>
        )}

        {/* Thin purple vertical accent bar, left edge */}
        <div className="absolute left-0 top-0 h-[40vh] w-[3px] z-20 pointer-events-none" style={{ background: `linear-gradient(180deg, ${accentColor} 0%, ${accentColor}00 70%)` }} />

        {/* Watermark — confined to hero via overflow:hidden */}
        <div className="brutalist-watermark right-[-3vw] top-[4vh] z-0" style={{ fontSize: "clamp(14rem, 32vw, 30rem)" }}>
          {heroWatermarkLetter}
        </div>

        {/* Top row: collective pill + event stamp */}
        <header className="relative z-30 px-5 sm:px-10 lg:px-14 pt-7 sm:pt-9 max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {collective.logo_url ? (
                <Image
                  src={collective.logo_url}
                  alt={collective.name}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full ring-1 ring-white/15 object-cover shrink-0"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ring-1 ring-white/15"
                  style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` }}
                >
                  {collectiveInitials.slice(0, 2)}
                </div>
              )}
              <div className="font-mono text-[10.5px] sm:text-[11px] uppercase tracking-[0.28em] text-white/65 font-medium">
                {collective.name}
                {venue?.city && (
                  <>
                    {" "}<span className="text-white/30">·</span> {venue.city}
                  </>
                )}
              </div>
            </div>

            {/* Diagonal stamp top right */}
            <div className="brutalist-stamp hidden sm:block" style={{ transform: "rotate(-6deg)" }}>
              EVENT {eventNumber} · RUN BY {collectiveInitials} · {yearNum}
            </div>
          </div>
        </header>

        {/* Main hero — content-sized, two-column on desktop */}
        <div className="relative z-20 px-5 sm:px-10 lg:px-14 pt-8 sm:pt-10 lg:pt-12 pb-12 sm:pb-14 lg:pb-16 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* LEFT: title + meta + tags + CTA + going badge */}
            <div className="lg:col-span-7 xl:col-span-7">
              {/* Title — tamed scale */}
              <h1
                className="font-heading font-bold text-white mb-5 sm:mb-6 break-words"
                style={{ letterSpacing: "-0.03em", lineHeight: 0.95, fontSize: "clamp(2.25rem, 7vw, 5rem)" }}
              >
                {(() => {
                  const words = event.title.split(" ");
                  return words.map((word, i) => {
                    const isLast = i === words.length - 1;
                    const isRoman = /^[IVXLC]+\.?$/.test(word) || /^\d+$/.test(word);
                    if (isLast || isRoman) {
                      return (
                        <span key={i}>
                          {i > 0 ? " " : ""}
                          <span
                            style={{ color: accentColor, fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.02em" }}
                          >
                            {word}
                          </span>
                        </span>
                      );
                    }
                    return <span key={i}>{i > 0 ? " " : ""}{word}</span>;
                  });
                })()}
              </h1>

              {/* One-line meta */}
              <div className="font-body font-medium text-[14.5px] text-white/[0.78] mb-5 sm:mb-6 max-w-[720px]" style={{ letterSpacing: "-0.005em" }}>
                <span className="brutalist-mono text-[13px] text-white/60" style={{ letterSpacing: "0.02em" }}>
                  {dayName} {monthName} {dayNum}
                </span>
                <span className="text-white/30 mx-2">·</span>
                <span>Doors {doorsTime || startTime}</span>
                {venue && (
                  <>
                    <span className="text-white/30 mx-2">·</span>
                    <span>{venue.name}{venue.city ? `, ${venue.city}` : ""}</span>
                  </>
                )}
              </div>

              {/* Vibe tags */}
              {vibeTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6 sm:mb-7">
                  {vibeTags.map((tag, i) => (
                    <span
                      key={tag}
                      className={`text-[11px] font-mono font-medium tracking-[0.18em] uppercase px-3 py-1.5 border rounded-full ${
                        i === vibeTags.length - 1
                          ? "border-nocturn/40 bg-nocturn/5 text-nocturn-glow"
                          : "border-white/[0.1] text-white/60"
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* CTA + going badge */}
              {isUpcoming && (isEffectivelyFree || (tiers && tiers.length > 0)) && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-5 max-w-[720px]">
                  <a
                    href={ctaAnchor}
                    className="group relative inline-flex items-center justify-center gap-2.5 w-full sm:w-auto px-7 sm:px-9 py-[17px] rounded-[14px] text-white font-bold text-[15px] sm:text-[16px] transition-all duration-300 hover:brightness-[1.12] hover:translate-y-[-2px] active:translate-y-[1px] active:scale-[0.99]"
                    style={{ backgroundColor: accentColor, letterSpacing: "-0.005em" }}
                  >
                    {ctaLabel}
                    <span className="transition-transform duration-300 group-hover:translate-x-1 text-[18px] leading-none">→</span>
                  </a>

                  {(ticketsSold ?? 0) > 0 && (
                    <div className="flex items-center gap-2.5 px-4 py-2.5 border border-white/10 rounded-full bg-white/[0.03] self-center sm:self-auto">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[12.5px] text-white/65">
                        <span className="text-white font-bold brutalist-mono">{ticketsSold}</span> going
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: brutalist countdown */}
            {isUpcoming && (
              <aside className="lg:col-span-5 xl:col-span-5 mt-2 lg:mt-0">
                <EventCountdown
                  targetDate={event.doors_at || event.starts_at}
                  variant="hero"
                  footerLine={countdownFooter}
                />
              </aside>
            )}
          </div>
        </div>
      </section>

      {/* ═══ RECEIPT-STRIP INFO BAR ═══ */}
      <section className="relative bg-[#09090B]">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 pt-6 sm:pt-7 pb-7 sm:pb-8">
          <div className="grid grid-cols-2 sm:grid-cols-5 max-w-[1100px] mx-auto border-y border-white/[0.08]">
            <div className="py-4 sm:pr-5 sm:border-r sm:border-white/[0.08] border-b sm:border-b-0 border-white/[0.08]">
              <div className="brutalist-mono text-[10px] font-bold tracking-[0.32em] uppercase text-white/45 mb-1.5">Date</div>
              <div className="brutalist-mono text-[15px] sm:text-[16px] font-medium text-white">
                {dayName} {month2}.{day2}.{year2}
              </div>
            </div>
            {doorsTime24 && (
              <div className="py-4 sm:px-5 sm:border-r sm:border-white/[0.08] border-b sm:border-b-0 border-white/[0.08]">
                <div className="brutalist-mono text-[10px] font-bold tracking-[0.32em] uppercase text-white/45 mb-1.5">Doors</div>
                <div className="brutalist-mono text-[15px] sm:text-[16px] font-medium text-white">{doorsTime24}</div>
              </div>
            )}
            <div className="py-4 sm:px-5 sm:border-r sm:border-white/[0.08] border-b sm:border-b-0 border-white/[0.08]">
              <div className="brutalist-mono text-[10px] font-bold tracking-[0.32em] uppercase text-white/45 mb-1.5">Show</div>
              <div className="brutalist-mono text-[15px] sm:text-[16px] font-medium text-white">
                {startTime24}{endTime24 ? `–${endTime24}` : ""}
              </div>
            </div>
            {venue && (
              <div className="py-4 sm:px-5 sm:border-r sm:border-white/[0.08] border-b sm:border-b-0 border-white/[0.08]">
                <div className="brutalist-mono text-[10px] font-bold tracking-[0.32em] uppercase text-white/45 mb-1.5">Venue</div>
                <div className="brutalist-mono text-[15px] sm:text-[16px] font-medium text-white truncate uppercase">{venue.name}</div>
              </div>
            )}
            {event.min_age && (
              <div className="py-4 sm:pl-5">
                <div className="brutalist-mono text-[10px] font-bold tracking-[0.32em] uppercase text-white/45 mb-1.5">Min Age</div>
                <div className="brutalist-mono text-[15px] sm:text-[16px] font-medium text-white">{event.min_age}+</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Status banners */}
      {event.status === "cancelled" && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-10">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-center">
              <p className="font-heading text-lg font-semibold text-red-400">
                This event has been cancelled.
              </p>
            </div>
          </div>
        </section>
      )}
      {event.status === "completed" && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-10">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-center">
              <p className="font-heading text-lg font-semibold text-white/50">
                This event has ended. Thanks for coming!
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ═══ 01 / VENUE ═══ */}
      {venue && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("venue", "VENUE")}</div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="brutalist-chapter hover:text-white transition-colors">
                  GET DIRECTIONS →
                </a>
              )}
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-12" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10">
              <div className="lg:col-span-7 space-y-6">
                <h3
                  className="font-heading font-bold text-white"
                  style={{ fontSize: "clamp(2.25rem, 6vw, 4.25rem)", letterSpacing: "-0.05em", lineHeight: 0.88 }}
                >
                  {venue.name}
                </h3>
                <div className="brutalist-mono text-[14px] sm:text-[15px] text-white/60 max-w-[520px] leading-[1.7]">
                  {venue.address && <>{venue.address.toUpperCase()}<br /></>}
                  {venue.city && venue.city.toUpperCase()}
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  {venue.capacity > 0 && (
                    <div className="px-3 py-1.5 border border-white/10 rounded-full text-[11px] font-mono uppercase tracking-[0.18em] text-white/55">
                      Cap. {venue.capacity}
                    </div>
                  )}
                  {event.min_age && (
                    <div className="px-3 py-1.5 border border-white/10 rounded-full text-[11px] font-mono uppercase tracking-[0.18em] text-white/55">
                      {event.min_age}+ entry
                    </div>
                  )}
                </div>
              </div>

              {/* Map placeholder (preserves the SVG grid look from mockup) */}
              <div className="lg:col-span-5 relative h-56 sm:h-64 rounded-[2px] overflow-hidden border border-white/[0.08] bg-[#18181B]">
                <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <defs>
                    <pattern id="brut-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#brut-grid)" />
                </svg>
                <div className="absolute top-[42%] left-[45%] -translate-x-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="absolute inset-0 w-8 h-8 rounded-full animate-ping -m-2" style={{ backgroundColor: `${accentColor}50` }} />
                    <div className="w-4 h-4 rounded-full ring-2 ring-[#09090B]" style={{ backgroundColor: accentColor }} />
                  </div>
                </div>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0"
                    aria-label="Open in Google Maps"
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ 02 / THE NIGHT — description, host quote, dress code ═══ */}
      {((event.description && event.description.trim().length > 0) || hostMessage || dressCode) && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B] overflow-hidden">
          <div className="brutalist-watermark -right-[5vw] top-[10%] z-0" style={{ fontSize: "clamp(14rem, 32vw, 36rem)" }}>
            {collectiveInitials.slice(0, 2)}
          </div>
          <div className="relative z-10 max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("night", "THE NIGHT")}</div>
              {hostMessage && <div className="brutalist-chapter hidden sm:block">A NOTE FROM {collective.name.toUpperCase()}</div>}
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-14" />

            <div className="brutalist-prose mx-auto">
              {/* Host message — quote treatment */}
              {hostMessage && (
                <div className="mb-8 sm:mb-10">
                  <div className="flex gap-4">
                    <div className="w-[2px] rounded-full shrink-0" style={{ background: `linear-gradient(180deg, ${accentColor}, transparent)` }} />
                    <div>
                      <p className="font-heading text-[16px] sm:text-[18px] text-white/85 leading-[1.7] italic">&ldquo;{hostMessage}&rdquo;</p>
                      <div className="flex items-center gap-2 mt-3">
                        {collective.logo_url ? (
                          <Image src={collective.logo_url} alt={collective.name || "Collective logo"} width={20} height={20} className="h-5 w-5 rounded-full" />
                        ) : (
                          <div className="h-5 w-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: accentColor }}>
                            {collective.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-[12px] text-white/50 font-medium">{collective.name}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Description body — uses ExpandableText */}
              {event.description && event.description.trim().length > 0 && (
                <ExpandableText text={event.description} />
              )}

              {/* Dress code receipt row */}
              {dressCode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 border-y border-white/[0.08] mt-10">
                  <div className="py-4 sm:pr-5 sm:border-r sm:border-white/[0.08] border-b sm:border-b-0 border-white/[0.08]">
                    <div className="brutalist-mono text-[10px] font-bold tracking-[0.32em] uppercase text-white/45 mb-1.5">Dress code</div>
                    <div className="font-heading text-[15px] text-white">{dressCode}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══ 03 / LINEUP — type-led tiles ═══ */}
      {artists && artists.length > 0 && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("lineup", "LINEUP")}</div>
              <div className="brutalist-chapter hidden sm:block">{artists.length} ARTISTS · IN SET ORDER</div>
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-14" />

            <div className="-mx-5 sm:mx-0">
              <div className={`flex sm:grid gap-0 overflow-x-auto sm:overflow-visible scrollbar-none snap-x snap-mandatory px-5 sm:px-0 ${
                artists.length === 1 ? "sm:grid-cols-1" : artists.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
              }`}>
                {artists.map((a, i) => {
                  const artist = a.artists;
                  if (!artist) return null;
                  const setTime = a.set_time
                    ? new Date(a.set_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false })
                    : null;
                  return (
                    <div
                      key={a.artist_id || i}
                      className="snap-start flex-shrink-0 w-[82vw] sm:w-auto relative border border-white/[0.08] sm:border-r-0 last:sm:border-r p-6 sm:p-8 bg-white/[0.01] mr-3 sm:mr-0 group min-h-[300px] sm:min-h-[340px] flex flex-col justify-between transition-all hover:bg-white/[0.025]"
                      style={{ borderColor: undefined }}
                    >
                      {/* top: set time prominent */}
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="brutalist-mono text-[10px] tracking-[0.32em] uppercase text-white/45 mb-1">Set</div>
                          <div className="brutalist-mono text-[26px] sm:text-[28px] font-medium tracking-[-0.01em]" style={{ color: `${accentColor}cc` }}>
                            {setTime || "—:—"}
                          </div>
                        </div>
                        <div className="brutalist-mono text-[10px] tracking-[0.32em] uppercase text-white/30">
                          {String(i + 1).padStart(2, "0")} / {String(artists.length).padStart(2, "0")}
                        </div>
                      </div>
                      {/* name + meta */}
                      <div>
                        <div
                          className="font-heading font-bold text-white mb-3 break-words"
                          style={{ fontSize: "clamp(1.6rem, 4vw, 2.6rem)", letterSpacing: "-0.05em", lineHeight: 0.92 }}
                        >
                          {artist.name.toUpperCase()}
                        </div>
                        {artist.genre && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {(Array.isArray(artist.genre) ? artist.genre : [artist.genre]).slice(0, 3).map((g, gi) => (
                              <span
                                key={gi}
                                className="text-[11px] font-mono uppercase tracking-[0.18em] px-2.5 py-1 border rounded-sm border-white/10 text-white/65"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ 04 / ENTRY (paid tickets) ═══ */}
      {isUpcoming && showTickets && tiers && tiers.length > 0 && (
        <section id="tickets" className="relative border-t border-white/[0.06] bg-[#09090B] overflow-hidden">
          <div className="brutalist-watermark -left-[3vw] top-[8%] z-0" style={{ fontSize: "clamp(12rem, 26vw, 28rem)" }}>
            $
          </div>
          <div className="relative z-10 max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("entry", "ENTRY")}</div>
              <div className="brutalist-chapter hidden sm:block">{tiers.length} {tiers.length === 1 ? "TIER" : "TIERS"} · USD</div>
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-14" />

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
              eventTitle={event.title}
              eventDate={eventDate.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
              eventVenue={venue?.name ?? "TBA"}
              referrerToken={referrerToken}
            />
          </div>
        </section>
      )}

      {/* ═══ 04 / RSVP (free events) ═══ */}
      {isUpcoming && showRsvp && (
        <section id="rsvp" className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("rsvp", "RSVP")}</div>
              <div className="brutalist-chapter hidden sm:block">FREE ENTRY</div>
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-14" />

            <div className="space-y-10">
              <RsvpWidget
                eventId={event.id}
                eventTitle={event.title}
                accentColor={accentColor}
                initialCounts={rsvpCounts}
                initialMyStatus={myRsvpStatus}
                isLoggedIn={isLoggedIn}
                initialPhone={viewerPhone}
                initialEmail={viewerEmail}
                initialFullName={viewerFullName}
                rsvpToken={rsvpToken ?? null}
              />
              <PublicRsvpList
                eventId={event.id}
                accentColor={accentColor}
                initialRsvps={initialPublicRsvps}
              />
            </div>
          </div>
        </section>
      )}

      {/* ═══ 05 / DISPATCHES — organizer updates ═══ */}
      {eventUpdates.length > 0 && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("dispatches", "DISPATCHES")}</div>
              <div className="brutalist-chapter hidden sm:block">FROM {collectiveInitials} · {eventUpdates.length} POSTED</div>
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-14" />

            <EventUpdatesFeed
              updates={eventUpdates}
              accentColor={accentColor}
              collectiveName={collective.name}
            />
          </div>
        </section>
      )}

      {/* ═══ REACT + SHARE ═══ */}
      <section className="relative border-t border-white/[0.06] bg-[#09090B]">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-14 sm:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-16">
            <div>
              <div className="flex items-baseline justify-between gap-4 mb-5">
                <div className="brutalist-chapter">REACT</div>
              </div>
              <div className="brutalist-hairline mb-7" />
              <EventReactions eventId={event.id} initialCounts={reactionCounts} />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-4 mb-5">
                <div className="brutalist-chapter">TAKE IT</div>
                <div className="brutalist-chapter hidden sm:block">SHARE · CALENDAR</div>
              </div>
              <div className="brutalist-hairline mb-7" />
              <div className="flex flex-col sm:flex-row gap-3">
                <ShareButton url={publicUrl} title={event.title} />
                <a
                  href={buildCalendarUrl(event, shareCardVenue)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-[10px] border border-white/15 bg-white/[0.03] text-white font-bold text-[14px] hover:bg-white/[0.07] hover:border-white/25 transition-all min-h-[44px]"
                  style={{ letterSpacing: "-0.005em" }}
                >
                  <CalendarPlus className="w-4 h-4" />
                  Add to calendar
                </a>
              </div>
              <div className="mt-6">
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
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 06 / ALSO BY THIS COLLECTIVE ═══ */}
      <section className="relative border-t border-white/[0.06] bg-[#09090B] overflow-hidden">
        <div className="brutalist-watermark -left-[6vw] -bottom-[6vh] z-0" style={{ fontSize: "clamp(14rem, 32vw, 36rem)" }}>
          {collectiveInitials.slice(0, 2)}
        </div>
        <div className="relative z-10 max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
          <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
            <div className="brutalist-chapter">{chapter("share", "ALSO BY THIS COLLECTIVE")}</div>
          </div>
          <div className="brutalist-hairline mb-10 sm:mb-14" />

          <CollectiveProfile
            name={collective.name}
            slug={collective.slug}
            description={collective.bio ?? null}
            logoUrl={collective.logo_url}
            instagram={null}
            eventCount={collectiveEventCount ?? 0}
            accentColor={accentColor}
          />

          <div className="mt-12 sm:mt-16">
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
        </div>
      </section>

      {/* ═══ 07 / ALSO THIS WEEK ═══ */}
      {nearbyEvents && nearbyEvents.length > 0 && (
        <section className="relative border-t border-white/[0.06] bg-[#09090B]">
          <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-16 sm:py-20">
            <div className="flex items-baseline justify-between gap-4 mb-5 sm:mb-6">
              <div className="brutalist-chapter">{chapter("alsoweek", "ALSO THIS WEEK")}</div>
              {venue?.city && <div className="brutalist-chapter hidden sm:block">{venue.city.toUpperCase()}</div>}
            </div>
            <div className="brutalist-hairline mb-10 sm:mb-14" />

            <AlsoThisWeek
              events={nearbyEvents.map((e) => {
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
          </div>
        </section>
      )}

      {/* ═══ BOTTOM MARQUEE ═══ */}
      {bottomMarqueeItems.length > 0 && (
        <div className="brutalist-marquee" aria-hidden="true">
          <div className="brutalist-marquee-track">
            {[...bottomMarqueeItems, ...bottomMarqueeItems, ...bottomMarqueeItems, ...bottomMarqueeItems].map((item, i) => (
              <span key={i}>
                {item} <span style={{ color: accentColor, marginLeft: "1.25rem" }}>◆</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FOOTER — single brutalist row ═══ */}
      <footer className="relative border-t border-white/[0.06] bg-[#09090B] overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 lg:px-14 py-12 sm:py-16">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 sm:col-span-7">
              <div
                className="font-heading font-bold text-white"
                style={{ fontSize: "clamp(3rem, 9vw, 7rem)", letterSpacing: "-0.04em", lineHeight: 0.92 }}
              >
                NOCTURN<span style={{ color: accentColor }}>.</span>
              </div>
            </div>
            <div className="col-span-12 sm:col-span-5 flex flex-wrap gap-x-6 gap-y-3 sm:justify-end">
              <Link href="/legal/terms" className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/45 hover:text-white transition-colors">
                Terms
              </Link>
              <Link href="/legal/privacy" className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/45 hover:text-white transition-colors">
                Privacy
              </Link>
              <a href="https://trynocturn.com" target="_blank" rel="noopener" className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/45 hover:text-white transition-colors">
                About
              </a>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 brutalist-mono text-[10px] uppercase tracking-[0.32em] text-white/30">
            <div>© {yearNum} Nocturn</div>
            <div>YOU RUN THE NIGHT · NOCTURN RUNS THE BUSINESS</div>
          </div>
        </div>
      </footer>

      {/* Sticky ticket CTA — paid events only */}
      {isUpcoming && showTickets && tiers && tiers.length > 0 && (
        <StickyTicketBar
          lowestPrice={lowestTierPrice}
          accentColor={accentColor}
          ticketSectionId="tickets"
          remaining={totalRemaining}
        />
      )}
    </div>
  );
}
