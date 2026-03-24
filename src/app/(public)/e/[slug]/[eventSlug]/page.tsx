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
        <div className="-mt-24 relative space-y-0">

          {/* ═══ THE INVITATION ═══ */}
          <div className="space-y-6 pb-12">
            {/* Collective — who's inviting you */}
            <div className="flex items-center gap-2.5">
              {collective.logo_url ? (
                <Image
                  src={collective.logo_url}
                  alt={collective.name}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10"
                />
              ) : (
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white/10"
                  style={{ backgroundColor: accentColor }}
                >
                  {collective.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[13px] text-white/50">
                {collective.name} presents
              </span>
            </div>

            {/* The event name — massive, cinematic */}
            <h1 className="font-heading text-[2.75rem] font-black tracking-[-0.04em] text-white sm:text-[4rem] leading-[0.95] max-w-[95%]">
              {event.title}
            </h1>

            {/* The hook — one line that makes you want to go */}
            {event.description && (
              <p className="text-[17px] leading-[1.6] text-white/50 max-w-[90%]">
                {event.description.split(".")[0]}.
              </p>
            )}

            {/* Social proof — feels like your friends are already going */}
            {(ticketsSold ?? 0) > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {[...Array(Math.min(ticketsSold ?? 0, 4))].map((_, i) => (
                    <div
                      key={i}
                      className="h-7 w-7 rounded-full ring-2 ring-[#09090B]"
                      style={{
                        background: `linear-gradient(135deg, ${accentColor}${40 + i * 15}, ${accentColor}${20 + i * 10})`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-[13px] text-white/40">
                  <span className="text-white/70 font-medium">{ticketsSold}</span> {ticketsSold === 1 ? "person" : "people"} going
                </span>
                <SellingFastBadge soldPercent={soldPercent} />
              </div>
            )}

            {/* Vibe tags — whisper quiet */}
            {vibeTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {vibeTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] text-white/25 font-medium"
                  >
                    {tag}{vibeTags.indexOf(tag) < vibeTags.length - 1 ? " ·" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ═══ WHEN & WHERE — the essential info ═══ */}
          <div className="py-10 border-t border-white/[0.04] space-y-8">
            {/* Date — large, scannable */}
            <div className="flex items-start gap-5">
              <div className="flex flex-col items-center min-w-[64px]">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">{monthName}</span>
                <span className="font-heading text-[3rem] font-black text-white leading-none">{dayNum}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">{dayName}</span>
              </div>
              <div className="pt-2 space-y-1.5">
                <p className="text-lg text-white font-heading font-bold tracking-tight">
                  {startTime}{endTime ? ` — ${endTime}` : ""}
                </p>
                {doorsTime && (
                  <p className="text-[13px] text-white/35">Doors at {doorsTime}</p>
                )}
                {minAge && (
                  <p className="text-[13px] text-white/35">{minAge}+ only</p>
                )}
              </div>
            </div>

            {/* Countdown */}
            {isUpcoming && (
              <EventCountdown targetDate={event.doors_at || event.starts_at} />
            )}

            {/* Venue — immersive map card */}
            {venue && (
              <div className="rounded-2xl overflow-hidden border border-white/[0.04]">
                <div className="relative h-36 w-full">
                  <iframe
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(`${venue.name} ${venue.address} ${venue.city}`)}&zoom=15&maptype=roadmap`}
                    className="h-full w-full border-0 opacity-70 grayscale contrast-[1.1]"
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${venue.name}`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] to-transparent pointer-events-none" />
                </div>
                <div className="px-5 pb-5 -mt-8 relative z-10">
                  <p className="font-heading text-xl font-bold text-white">{venue.name}</p>
                  <p className="text-[13px] text-white/40 mt-0.5">
                    {venue.address}{venue.address && venue.city ? ", " : ""}{venue.city}
                  </p>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium transition-colors hover:text-white/70"
                      style={{ color: accentColor }}
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Directions
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══ THE STORY — description + host message ═══ */}
          {(event.description || hostMessage || dressCode) && (
            <div className="py-10 border-t border-white/[0.04] space-y-8">
              {/* Full description */}
              {event.description && event.description.split(".").length > 1 && (
                <div className="max-w-[95%]">
                  <ExpandableText text={event.description} />
                </div>
              )}

              {/* Host message — personal note */}
              {hostMessage && (
                <div className="flex gap-3">
                  <div className="w-[3px] rounded-full shrink-0" style={{ backgroundColor: `${accentColor}40` }} />
                  <div>
                    <p className="text-[15px] text-white/60 leading-[1.7] italic">
                      &ldquo;{hostMessage}&rdquo;
                    </p>
                    <p className="text-[12px] text-white/30 mt-2 font-medium">— {collective.name}</p>
                  </div>
                </div>
              )}

              {/* Dress code — casual inline */}
              {dressCode && (
                <p className="text-[13px] text-white/30">
                  <span className="text-white/50 font-medium">Dress code:</span> {dressCode}
                </p>
              )}
            </div>
          )}

          {/* ═══ THE LINEUP ═══ */}
          {artists && artists.length > 0 && (
            <div className="py-10 border-t border-white/[0.04]">
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
            <div id="ticket-section" className="py-10 border-t border-white/[0.04]">
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
          <div className="py-6">
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

          {/* ═══ FOOTER ═══ */}
          <div className="border-t border-white/[0.04] pt-10 pb-6 text-center space-y-3">
            <Link
              href="https://trynocturn.com"
              className="inline-flex items-center gap-1.5 text-[12px] text-white/20 transition-colors hover:text-white/40"
            >
              <span className="text-sm">🌙</span>
              <span className="font-heading font-bold text-white/30">nocturn.</span>
            </Link>
            <div className="flex justify-center gap-4 text-[11px] text-white/15">
              <Link href="/legal/terms" className="hover:text-white/30 transition-colors">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-white/30 transition-colors">Privacy</Link>
            </div>
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
