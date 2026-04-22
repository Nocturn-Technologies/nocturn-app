import { notFound } from "next/navigation";
import { Navigation, Music, MapPin, CalendarPlus } from "lucide-react";
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
// Short window reduces stale capacity data shown to buyers (Gap 16)
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

  // Always use the dynamic OG generator — even when a flyer exists.
  // Portrait flyers (1080×1350 for IG stories) get cropped unreadably by
  // social platforms that enforce 1.91:1 aspect ratio. The generator composites
  // the flyer as a left panel and renders title/date/venue in the right panel,
  // guaranteeing every share preview is readable regardless of flyer orientation.
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
      // iMessage / Apple link previews key off these, and some
      // clients still read the legacy non-OG tags.
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

  // Fetch collective. PR #93 dropped instagram + description from collectives
  // (bio is the replacement; no socials column yet).
  const { data: collectiveRaw2 } = await supabase
    .from("collectives")
    .select("id, name, slug, logo_url, bio")
    .eq("slug", slug)
    .maybeSingle();
  const collective = collectiveRaw2 as { id: string; name: string; slug: string; logo_url: string | null; bio: string | null } | null;

  if (!collective) notFound();

  // Fetch event. Post-#93 the venue lives on flat columns (venue_name /
  // venue_address / city / capacity) on the event itself — the old
  // `venues(...)` FK join no longer resolves because the `venues` table was
  // replaced by `venue_profiles`. Also `events.deleted_at` was dropped.
  const { data: eventRaw2 } = await supabase
    .from("events")
    .select("id, title, slug, description, starts_at, ends_at, doors_at, status, flyer_url, vibe_tags, min_age, metadata, collective_id, is_free, venue_name, venue_address, city, capacity")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .maybeSingle();
  const eventRow = eventRaw2 as { id: string; title: string; slug: string; description: string | null; starts_at: string; ends_at: string | null; doors_at: string | null; status: string; flyer_url: string | null; vibe_tags: string[] | null; min_age: number | null; metadata: Record<string, string> | null; collective_id: string; is_free: boolean | null; venue_name: string | null; venue_address: string | null; city: string | null; capacity: number | null } | null;

  if (!eventRow || eventRow.status === "draft") notFound();

  // Adapt to the legacy shape the rest of the page expects: synthesise a
  // `venues` object from the flat columns + add event_mode placeholder so
  // downstream renders don't need to change yet.
  const event = {
    ...eventRow,
    event_mode: null as string | null,
    venues: eventRow.venue_name
      ? { name: eventRow.venue_name, address: eventRow.venue_address ?? "", city: eventRow.city ?? "", capacity: eventRow.capacity ?? 0 }
      : null,
  };

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
    { data: pendingTierTicketsRaw },
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
    supabase.from("tickets").select("ticket_tier_id").eq("event_id", event.id).eq("status", "pending").gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
  ]);

  const tiers = tiersRaw as { id: string; name: string; price: number; capacity: number; sort_order: number }[] | null;
  const artists = artistsRaw as { artist_id: string; set_time: string | null; artists: { name: string; genre: string[] | null } | null }[] | null;
  const reactionRows = reactionRowsRaw as { emoji: string }[] | null;
  const pastEvents = pastEventsRaw as { title: string; slug: string; flyer_url: string | null; starts_at: string }[] | null;
  const nearbyEvents = nearbyEventsRaw as { title: string; slug: string; flyer_url: string | null; starts_at: string; collective_id: string; collectives: { name: string; slug: string } | null; venues: { name: string; city: string } | null }[] | null;
  const tierTickets = tierTicketsRaw as { ticket_tier_id: string }[] | null;
  const pendingTierTickets = pendingTierTicketsRaw as { ticket_tier_id: string }[] | null;

  // Compute per-tier sold counts for accurate "remaining" display
  // Include confirmed tickets + active pending reservations (< 30 min old) toward capacity
  const tierSoldCounts: Record<string, number> = {};
  for (const t of tierTickets || []) {
    tierSoldCounts[t.ticket_tier_id] = (tierSoldCounts[t.ticket_tier_id] || 0) + 1;
  }
  for (const t of pendingTierTickets || []) {
    tierSoldCounts[t.ticket_tier_id] = (tierSoldCounts[t.ticket_tier_id] || 0) + 1;
  }


  const reactionCounts: Record<string, number> = {};
  for (const r of reactionRows || []) {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
  }

  // Mode detection: free RSVP events show the RSVP widget instead of (or in addition to) tickets.
  //
  // Effectively-free fallback: if the organizer left event_mode on "ticketed" but every
  // tier is $0 (or there are no tiers, or is_free is explicitly set), we treat the event
  // as RSVP-only for display. This guarantees the public page never shows "$0+ Get Tickets"
  // on a free event, and always shows the RSVP widget which collects guest name + email.
  const rawMode = (event.event_mode ?? "ticketed") as "ticketed" | "rsvp" | "hybrid";
  const allTiersFree = !!tiers && tiers.length > 0 && tiers.every((t) => Number(t.price) === 0);
  const noTiers = !tiers || tiers.length === 0;
  const isEffectivelyFree = event.is_free === true || allTiersFree || noTiers;
  const eventMode: "ticketed" | "rsvp" | "hybrid" = isEffectivelyFree ? "rsvp" : rawMode;
  const showRsvp = eventMode === "rsvp" || eventMode === "hybrid";
  const showTickets = (eventMode === "ticketed" || eventMode === "hybrid") && !isEffectivelyFree;

  // RSVP counts + current user's RSVP + event updates — fetched in parallel for RSVP/hybrid events
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

  // Pre-fill phone from the logged-in user's profile so the confirm form
  // doesn't force them to retype it every time.
  let viewerPhone: string | null = null;
  if (currentUserResult && showRsvp) {
    const { data: viewerProfile } = await supabase
      .from("users")
      .select("phone")
      .eq("auth_id", currentUserResult.id)
      .maybeSingle();
    viewerPhone = viewerProfile?.phone ?? null;
  }

  // If the user landed here via the confirmation-email deep link
  // (`?rsvp=TOKEN`), resolve their RSVP by token so guests without
  // a session still see their current status and can change it.
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

  const startTime = eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const endTime = endsAt ? endsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz }) : null;
  const doorsTime = doorsAt ? doorsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz }) : null;

  const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${slug}/${eventSlug}`;
  const mapsUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}` : null;

  // Dress code / min age / host message from metadata
  const dressCode = metadata.dressCode || null;
  const hostMessage = metadata.hostMessage || null;
  const vibeTags = event.vibe_tags ?? [];

  // Share card data
  const shareCardDate = `${dayName} ${monthName} ${dayNum} \u2022 ${startTime}`;
  const shareCardVenue = venue ? `${venue.name} \u2022 ${venue.city}` : "";
  // If the event is effectively free (no tiers, all $0 tiers, or is_free flag), always
  // show "Free" — never "$0+".
  const lowestTierPrice = isEffectivelyFree
    ? "Free"
    : tiers && tiers.length > 0
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

  return (
    <div className="min-h-dvh bg-[#09090B] antialiased selection:bg-purple-500/20 overflow-x-hidden" style={{ scrollBehavior: "smooth" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* ═══ SCENE 1: THE POSTER — raw, asymmetric, bold ═══ */}
      <div className="relative min-h-dvh flex items-end overflow-hidden">
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
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/55">
              {collective.name}
            </span>
          </div>

          {/* Title — massive, poster-scale */}
          <h1 className="font-heading text-[clamp(2.5rem,12vw,8rem)] font-black tracking-[-0.05em] text-white leading-[0.85] max-w-[85%] mb-8 break-words">
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
              <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-white/50 mb-1">Date</div>
              <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{dayName} {monthName} {dayNum}</div>
            </div>
            {doorsTime && (
              <div className="px-5 sm:px-6 border-r border-white/[0.06] py-1">
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-white/50 mb-1">Doors</div>
                <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{doorsTime}</div>
              </div>
            )}
            <div className="px-5 sm:px-6 border-r border-white/[0.06] py-1">
              <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-white/50 mb-1">Show</div>
              <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{startTime}{endTime ? ` — ${endTime}` : ""}</div>
            </div>
            {venue && (
              <div className="pl-5 sm:pl-6 py-1">
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-white/50 mb-1">Venue</div>
                <div className="font-heading text-[14px] sm:text-[15px] font-semibold">{venue.name}{venue.city ? `, ${venue.city}` : ""}</div>
              </div>
            )}
          </div>

          {/* Vibe tags */}
          {vibeTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {vibeTags.map((tag) => (
                <span key={tag} className="text-[11px] font-semibold tracking-[0.15em] uppercase px-3.5 py-1.5 border border-white/[0.06] rounded-full text-white/50">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA — full-width on mobile. Anchors to #rsvp for free events, #tickets for paid. */}
          {isUpcoming && (isEffectivelyFree || (tiers && tiers.length > 0)) && (
            <a
              href={isEffectivelyFree ? "#rsvp" : "#tickets"}
              className="inline-flex items-center justify-center gap-2.5 w-full sm:w-auto px-10 py-[18px] rounded-[14px] text-[16px] font-bold text-white transition-all duration-300 hover:brightness-[1.15] hover:translate-y-[-2px] active:scale-[0.98] max-w-[400px]"
              style={{ backgroundColor: accentColor }}
            >
              {isEffectivelyFree ? "RSVP — Free" : `Get Tickets — ${lowestTierPrice}`}
              <span className="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </a>
          )}
        </div>
      </div>

      {/* Floating "going" badge */}
      {(ticketsSold ?? 0) > 0 && (
        <div className="fixed bottom-20 right-4 z-45 flex items-center gap-2 px-4 py-2.5 bg-[#09090B]/85 backdrop-blur-xl border border-white/[0.08] rounded-full text-[13px] text-white/50">
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
              <div className="relative h-40 w-full bg-gradient-to-br from-[#1a1a2e] via-[#16162a] to-[#0e0e12] flex items-center justify-center">
                <MapPin className="h-10 w-10 text-white/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e12] via-transparent to-[#09090B]/40 pointer-events-none" />
                <div className="absolute bottom-3 left-4 text-[11px] font-semibold tracking-[0.2em] uppercase text-white/50 px-2.5 py-1 border border-white/[0.08] rounded">VENUE</div>
              </div>
              <div className="px-6 py-5">
                <p className="font-heading text-[24px] font-bold text-white">{venue.name}</p>
                <p className="text-[14px] text-white/50 mt-1">
                  {[venue.address, venue.city].filter((part) => typeof part === "string" && part.trim().length > 0).join(", ")}
                </p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-[13px] font-semibold transition-colors hover:text-white min-h-[44px] py-2"
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

        {dressCode && (
          <div className="py-4 border-t border-white/[0.04]">
            <p className="text-[13px] text-white/60"><span className="text-white/60">Dress code</span> — {dressCode}</p>
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
                          className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide truncate"
                          style={{
                            backgroundColor: `${accentColor}12`,
                            color: `${accentColor}cc`,
                          }}
                        >
                          {Array.isArray(artist.genre) ? artist.genre.join(" · ") : artist.genre}
                        </span>
                      )}
                      {a.set_time && (
                        <p className="text-[11px] text-white/50 font-medium">{new Date(a.set_time).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Toronto" })}</p>
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

          {/* ═══ RSVP (free events) ═══ */}
          {isUpcoming && showRsvp && (
            <div className="py-10 border-t border-white/[0.04]">
              <RsvpWidget
                eventId={event.id}
                eventTitle={event.title}
                accentColor={accentColor}
                initialCounts={rsvpCounts}
                initialMyStatus={myRsvpStatus}
                isLoggedIn={isLoggedIn}
                initialPhone={viewerPhone}
                rsvpToken={rsvpToken ?? null}
              />
            </div>
          )}

          {/* ═══ LIVE GUEST LIST (free events) ═══
              Partiful-style: first name + last initial, live counter,
              avatar stack, flash animation on new RSVPs. Server strips
              last names before they leave the server. */}
          {isUpcoming && showRsvp && (
            <div className="pb-10 border-t border-white/[0.04] pt-10">
              <PublicRsvpList
                eventId={event.id}
                accentColor={accentColor}
                initialRsvps={initialPublicRsvps}
              />
            </div>
          )}

          {/* ═══ TICKETS ═══ */}
          {isUpcoming && showTickets && tiers && tiers.length > 0 && (
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
                eventTitle={event.title}
                eventDate={eventDate.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                eventVenue={venue?.name ?? "TBA"}
                referrerToken={referrerToken}
              />
            </div>
          )}

          {/* ═══ UPDATES FROM ORGANIZER ═══ */}
          {eventUpdates.length > 0 && (
            <div className="py-10 border-t border-white/[0.04]">
              <EventUpdatesFeed
                updates={eventUpdates}
                accentColor={accentColor}
                collectiveName={collective.name}
              />
            </div>
          )}

          {/* ═══ REACTIONS ═══ */}
          <div className="py-8 border-t border-white/[0.04]">
            <EventReactions eventId={event.id} initialCounts={reactionCounts} />
          </div>

          {/* ─── Share + About ─── */}
          <div className="space-y-6 py-8 border-t border-white/[0.04]">
            <div className="flex items-center gap-3">
              <ShareButton url={publicUrl} title={event.title} />
              <a
                href={buildCalendarUrl(event, shareCardVenue)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/[0.08] transition-colors min-h-[44px]"
              >
                <CalendarPlus className="h-4 w-4" />
                Add to calendar
              </a>
            </div>

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
              description={collective.bio ?? null}
              logoUrl={collective.logo_url}
              instagram={null}
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

      {/* Sticky ticket CTA — appears when scrolled past tickets (paid events only) */}
      {isUpcoming && showTickets && tiers && tiers.length > 0 && (
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
          <div className="flex items-center gap-2 text-white/50">
            <span className="text-sm">🌙</span>
            <span className="text-xs font-semibold tracking-wide">nocturn.</span>
          </div>
          <div className="flex gap-4 text-[11px] text-white/50">
            <Link href="/legal/terms" className="hover:text-white/40 transition-colors inline-flex items-center min-h-[44px] py-3">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-white/40 transition-colors inline-flex items-center min-h-[44px] py-3">Privacy</Link>
            <a href="https://trynocturn.com" target="_blank" rel="noopener" className="hover:text-white/40 transition-colors inline-flex items-center min-h-[44px] py-3">About</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
