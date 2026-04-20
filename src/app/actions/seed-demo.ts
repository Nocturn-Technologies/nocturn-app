"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { randomUUID } from "crypto";
import { isValidUUID } from "@/lib/utils";

/**
 * Seeds a demo collective with realistic past events, ticket sales,
 * settlements, and attendee data. Run once for Techstars demos.
 *
 * Call from browser console: fetch('/api/seed-demo', { method: 'POST' })
 */
export async function seedDemoData(collectiveId: string) {
  try {
  if (!process.env.ALLOW_SEED) {
    return { error: "Seeding is disabled" };
  }
  if (!collectiveId?.trim()) return { error: "Collective ID is required" };
  if (!isValidUUID(collectiveId)) return { error: "Invalid collective ID format" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sb = createAdminClient();

  // Verify collective exists
  const { data: collective } = await sb
    .from("collectives")
    .select("id, name")
    .eq("id", collectiveId)
    .maybeSingle();

  if (!collective) return { error: "Collective not found" };

  // Verify user is an owner or admin of this collective (not just any member)
  const { data: membership } = await sb
    .from("collective_members")
    .select("role")
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) return { error: "Not a member of this collective" };
  if (!["owner", "admin"].includes(membership.role)) {
    return { error: "Only collective owners and admins can seed demo data" };
  }

  // Create 3 demo venues via parties + venue_profiles
  const venueData = [
    { name: "The Velvet Underground", slug: "velvet-underground-to", address: "508 Queen St W", city: "Toronto", capacity: 350 },
    { name: "CODA", slug: "coda-to", address: "794 Bathurst St", city: "Toronto", capacity: 500 },
    { name: "Nocturne Bar", slug: "nocturne-bar-to", address: "455 Spadina Ave", city: "Toronto", capacity: 200 },
  ];

  // Insert venue parties first
  const { data: venueParties, error: venuePartyError } = await sb
    .from("parties")
    .insert(venueData.map((v) => ({ display_name: v.name, type: "venue" as const })))
    .select("id");

  if (venuePartyError || !venueParties || venueParties.length === 0) {
    console.error("[seedDemoData] Failed to create venue parties:", venuePartyError);
    return { error: "Something went wrong" };
  }

  // Insert venue_profiles linked to parties
  const { data: insertedVenues, error: venueProfileError } = await sb
    .from("venue_profiles")
    .upsert(
      venueData.map((v, i) => ({
        party_id: venueParties[i].id,
        name: v.name,
        slug: v.slug,
        address: v.address,
        city: v.city,
        capacity: v.capacity,
      })),
      { onConflict: "slug" }
    )
    .select("id, name, capacity, party_id");

  if (venueProfileError || !insertedVenues || insertedVenues.length === 0) {
    console.error("[seedDemoData] Failed to create venue profiles:", venueProfileError);
    return { error: "Something went wrong" };
  }

  // Create 3 demo artists via parties + artist_profiles (small-collective scale — local DJs, modest fees)
  const artistData = [
    { name: "DJ Koda", slug: "dj-koda", genre: ["House", "Techno"], default_fee: 200 },
    { name: "Nadia Night", slug: "nadia-night", genre: ["Deep House", "Afro House"], default_fee: 250 },
    { name: "Pulse Collective", slug: "pulse-collective", genre: ["Drum & Bass", "Jungle"], default_fee: 175 },
  ];

  // Insert artist parties first
  const { data: artistParties, error: artistPartyError } = await sb
    .from("parties")
    .insert(artistData.map((a) => ({ display_name: a.name, type: "person" as const })))
    .select("id");

  if (artistPartyError || !artistParties || artistParties.length === 0) {
    console.error("[seedDemoData] Failed to create artist parties:", artistPartyError);
    return { error: "Something went wrong" };
  }

  // Insert artist_profiles linked to parties
  const { data: insertedArtists, error: artistProfileError } = await sb
    .from("artist_profiles")
    .upsert(
      artistData.map((a, i) => ({
        party_id: artistParties[i].id,
        slug: a.slug,
        genre: a.genre,
        default_fee: a.default_fee,
        is_active: true,
        is_verified: false,
      })),
      { onConflict: "slug" }
    )
    .select("id, party_id, default_fee");

  if (artistProfileError || !insertedArtists) {
    console.error("[seedDemoData] Failed to create artist profiles:", artistProfileError);
    return { error: "Something went wrong" };
  }

  // Look up artist display names from parties for event_artists inserts
  const artistNames = artistData.map((a) => a.name);
  const artistFees = artistData.map((a) => a.default_fee);

  // Create 3 past events (completed, with realistic dates)
  // Events now use flat venue columns — no venue_id FK
  const now = new Date();
  const events = [
    {
      collective_id: collectiveId,
      venue_name: venueData[0].name,
      venue_address: venueData[0].address,
      city: venueData[0].city,
      title: "Deep Frequencies Vol. 3",
      slug: `deep-frequencies-vol-3-${randomUUID().slice(0, 8)}`,
      status: "completed" as const,
      starts_at: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString(),
      doors_at: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      min_age: 19,
      vibe_tags: ["Underground", "Techno", "Late Night"],
    },
    {
      collective_id: collectiveId,
      venue_name: venueData[1].name,
      venue_address: venueData[1].address,
      city: venueData[1].city,
      title: "Nocturnal Sounds: Opening Night",
      slug: `nocturnal-sounds-opening-${randomUUID().slice(0, 8)}`,
      status: "completed" as const,
      starts_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
      doors_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      min_age: 19,
      vibe_tags: ["House", "Community", "Underground"],
    },
    {
      collective_id: collectiveId,
      venue_name: venueData[2].name,
      venue_address: venueData[2].address,
      city: venueData[2].city,
      title: "Warehouse Sessions 001",
      slug: `warehouse-sessions-001-${randomUUID().slice(0, 8)}`,
      status: "completed" as const,
      starts_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ends_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      doors_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      min_age: 19,
      vibe_tags: ["Drum & Bass", "Jungle", "Intimate"],
    },
  ];

  const { data: insertedEvents, error: eventError } = await sb
    .from("events")
    .insert(events)
    .select("id, title");

  if (eventError || !insertedEvents) {
    console.error("[seedDemoData] Failed to create events:", eventError);
    return { error: "Something went wrong" };
  }

  // Create ticket tiers + tickets + settlements for each event
  // Small-collective scale: 40–90 person rooms, $15–28 tickets, no VIP tier
  const ticketConfigs = [
    // Show 1 (oldest): Soft launch — 45 paid, $800 gross
    { earlyPrice: 15, gaPrice: 20, earlySold: 20, gaSold: 25 },
    // Show 2: Growing — 55 paid, ~$1,200 gross
    { earlyPrice: 18, gaPrice: 25, earlySold: 25, gaSold: 30 },
    // Show 3 (most recent): Peak — 75 paid, ~$1,900 gross
    { earlyPrice: 22, gaPrice: 28, earlySold: 35, gaSold: 40 },
  ];

  for (let i = 0; i < insertedEvents.length; i++) {
    const event = insertedEvents[i];
    const config = ticketConfigs[i];

    // Create tiers (just Early Bird + GA — small crews rarely do 3 tiers)
    const tiers = [
      { event_id: event.id, name: "Early Bird", price: config.earlyPrice, capacity: config.earlySold, sort_order: 0 },
      { event_id: event.id, name: "GA", price: config.gaPrice, capacity: config.gaSold + 20, sort_order: 1 },
    ];

    const { data: insertedTiers, error: tierError } = await sb
      .from("ticket_tiers")
      .insert(tiers)
      .select("id, name, price");

    if (tierError) {
      console.error("[seedDemoData] Failed to create ticket tiers:", tierError);
    }
    if (!insertedTiers) continue;

    // Create tickets — new tickets table has minimal columns:
    // event_id, tier_id, holder_party_id (nullable), qr_code (nullable), status, order_line_id (nullable)
    const soldCounts = [config.earlySold, config.gaSold];
    const allTickets: Array<{
      event_id: string;
      tier_id: string;
      status: string;
      qr_code: string;
    }> = [];

    for (let t = 0; t < insertedTiers.length; t++) {
      const tier = insertedTiers[t];
      const count = soldCounts[t];
      for (let j = 0; j < count; j++) {
        allTickets.push({
          event_id: event.id,
          tier_id: tier.id,
          status: "checked_in",
          qr_code: randomUUID(),
        });
      }
    }

    // Insert in batches of 100
    for (let batch = 0; batch < allTickets.length; batch += 100) {
      const { error: ticketErr } = await sb.from("tickets").insert(allTickets.slice(batch, batch + 100));
      if (ticketErr) {
        console.error("[seedDemoData] Failed to insert ticket batch:", ticketErr);
      }
    }

    // Book artists — event_artists uses name + party_id (no artist_id FK)
    const artistIndex = i % insertedArtists.length;
    const secondArtistIndex = (i + 1) % insertedArtists.length;
    const { error: bookingErr } = await sb.from("event_artists").insert([
      {
        event_id: event.id,
        name: artistNames[artistIndex],
        party_id: insertedArtists[artistIndex].party_id,
        fee: artistFees[artistIndex],
        sort_order: 0,
      },
      {
        event_id: event.id,
        name: artistNames[secondArtistIndex],
        party_id: insertedArtists[secondArtistIndex].party_id,
        fee: artistFees[secondArtistIndex],
        sort_order: 1,
      },
    ]);
    if (bookingErr) {
      console.error("[seedDemoData] Failed to book artists:", bookingErr);
    }

    // Calculate and create settlement
    // New settlements schema: total_revenue, net_payout, stripe_fee, platform_fee
    const grossRevenue = config.earlySold * config.earlyPrice + config.gaSold * config.gaPrice;
    const totalArtistFees = artistFees[artistIndex] + artistFees[secondArtistIndex];
    const venueFee = Math.round(grossRevenue * 0.15);
    const otherCosts = Math.round(grossRevenue * 0.08);
    const platformFee = Math.round(grossRevenue * 0.07);
    const stripeFee = Math.round(grossRevenue * 0.029 + (config.earlySold + config.gaSold) * 0.3);
    const netPayout = grossRevenue - totalArtistFees - venueFee - otherCosts - platformFee - stripeFee;

    const { error: settlementErr } = await sb.from("settlements").insert({
      event_id: event.id,
      collective_id: collectiveId,
      status: "approved",
      total_revenue: grossRevenue,
      net_payout: netPayout,
      stripe_fee: stripeFee,
      platform_fee: platformFee,
    });
    if (settlementErr) {
      console.error("[seedDemoData] Failed to create settlement:", settlementErr);
    }
  }

  // Summary
  const totalTickets = ticketConfigs.reduce((sum, c) => sum + c.earlySold + c.gaSold, 0);
  const totalRevenue = ticketConfigs.reduce((sum, c) => {
    return sum + c.earlySold * c.earlyPrice + c.gaSold * c.gaPrice;
  }, 0);

  return {
    error: null,
    summary: {
      events: insertedEvents.length,
      totalTickets,
      totalRevenue,
      venues: insertedVenues.length,
      artists: insertedArtists.length,
    },
  };
  } catch (err) {
    console.error("[seedDemoData]", err);
    return { error: "Something went wrong" };
  }
}
