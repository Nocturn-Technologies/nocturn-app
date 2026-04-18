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

  // Create 3 demo venues
  const venues = [
    { name: "The Velvet Underground", slug: "velvet-underground-to", address: "508 Queen St W", city: "Toronto", capacity: 350, contact_email: "bookings@velvetunderground.com" },
    { name: "CODA", slug: "coda-to", address: "794 Bathurst St", city: "Toronto", capacity: 500, contact_email: "info@codatoronto.com" },
    { name: "Nocturne Bar", slug: "nocturne-bar-to", address: "455 Spadina Ave", city: "Toronto", capacity: 200, contact_email: "events@nocturnebar.com" },
  ];

  const { data: insertedVenues, error: venueError } = await sb
    .from("venues")
    .upsert(venues, { onConflict: "slug" })
    .select("id, name, capacity");

  if (venueError) {
    console.error("[seedDemoData] Failed to create venues:", venueError);
    return { error: "Something went wrong" };
  }
  if (!insertedVenues || insertedVenues.length === 0) {
    return { error: "Failed to create venues" };
  }

  // Create 3 demo artists (small-collective scale — local DJs, modest fees)
  const artists = [
    { name: "DJ Koda", slug: "dj-koda", genre: ["House", "Techno"], default_fee: 200 },
    { name: "Nadia Night", slug: "nadia-night", genre: ["Deep House", "Afro House"], default_fee: 250 },
    { name: "Pulse Collective", slug: "pulse-collective", genre: ["Drum & Bass", "Jungle"], default_fee: 175 },
  ];

  const { data: insertedArtists, error: artistError } = await sb
    .from("artists")
    .upsert(artists, { onConflict: "slug" })
    .select("id, name, default_fee");

  if (artistError) {
    console.error("[seedDemoData] Failed to create artists:", artistError);
    return { error: "Something went wrong" };
  }
  if (!insertedArtists) {
    console.error("[seedDemoData] Failed to create artists");
    return { error: "Something went wrong" };
  }

  // Create 3 past events (completed, with realistic dates)
  const now = new Date();
  const events = [
    {
      collective_id: collectiveId,
      venue_id: insertedVenues[0].id,
      title: "Deep Frequencies Vol. 3",
      slug: "deep-frequencies-vol-3",
      status: "completed" as const,
      starts_at: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString(), // 3 weeks ago
      ends_at: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString(),
      doors_at: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      min_age: 19,
      vibe_tags: ["Underground", "Techno", "Late Night"],
    },
    {
      collective_id: collectiveId,
      venue_id: insertedVenues[1].id,
      title: "Nocturnal Sounds: Opening Night",
      slug: "nocturnal-sounds-opening",
      status: "completed" as const,
      starts_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
      ends_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString(),
      doors_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      min_age: 19,
      vibe_tags: ["House", "Community", "Underground"],
    },
    {
      collective_id: collectiveId,
      venue_id: insertedVenues[2].id,
      title: "Warehouse Sessions 001",
      slug: "warehouse-sessions-001",
      status: "completed" as const,
      starts_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
      ends_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
      doors_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
      min_age: 19,
      vibe_tags: ["Drum & Bass", "Jungle", "Intimate"],
    },
  ];

  const { data: insertedEvents, error: eventError } = await sb
    .from("events")
    .insert(events)
    .select("id, title, venue_id");

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
      { event_id: event.id, name: "Early Bird", price: config.earlyPrice, capacity: config.earlySold },
      { event_id: event.id, name: "GA", price: config.gaPrice, capacity: config.gaSold + 20 },
    ];

    const { data: insertedTiers, error: tierError } = await sb
      .from("ticket_tiers")
      .insert(tiers)
      .select("id, name, price");

    if (tierError) {
      console.error("[seedDemoData] Failed to create ticket tiers:", tierError);
    }
    if (!insertedTiers) continue;

    // Create tickets (all checked_in for past events)
    const soldCounts = [config.earlySold, config.gaSold];
    const allTickets: Array<{
      event_id: string;
      ticket_tier_id: string;
      status: "reserved" | "paid" | "checked_in" | "refunded" | "cancelled" | "free" | "pending";
      price_paid: number;
      currency: string;
      ticket_token: string;
      metadata: { demo: boolean; customer_email: string };
    }> = [];

    for (let t = 0; t < insertedTiers.length; t++) {
      const tier = insertedTiers[t];
      const count = soldCounts[t];
      for (let j = 0; j < count; j++) {
        allTickets.push({
          event_id: event.id,
          ticket_tier_id: tier.id,
          status: "checked_in",
          price_paid: tier.price,
          currency: "usd",
          ticket_token: randomUUID(),
          metadata: { demo: true, customer_email: `attendee${j + 1}@demo.nocturn.app` },
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

    // Book artists
    const artistIndex = i % insertedArtists.length;
    const secondArtist = (i + 1) % insertedArtists.length;
    const { error: bookingErr } = await sb.from("event_artists").insert([
      { event_id: event.id, artist_id: insertedArtists[artistIndex].id, fee: insertedArtists[artistIndex].default_fee, status: "confirmed" },
      { event_id: event.id, artist_id: insertedArtists[secondArtist].id, fee: insertedArtists[secondArtist].default_fee, status: "confirmed" },
    ]);
    if (bookingErr) {
      console.error("[seedDemoData] Failed to book artists:", bookingErr);
    }

    // Calculate and create settlement
    // Buyer-pays pricing model → stripe/platform fees aren't organizer's costs
    const grossRevenue = config.earlySold * config.earlyPrice
      + config.gaSold * config.gaPrice;
    const totalArtistFees = (insertedArtists[artistIndex].default_fee ?? 0) + (insertedArtists[secondArtist].default_fee ?? 0);
    const venueFee = Math.round(grossRevenue * 0.15); // ~15% venue cut
    const otherCosts = Math.round(grossRevenue * 0.08); // ~8% for promo/supplies
    // total_costs is a generated column — let the DB compute it
    const profit = grossRevenue - totalArtistFees - venueFee - otherCosts;

    const { error: settlementErr } = await sb.from("settlements").insert({
      event_id: event.id,
      collective_id: collectiveId,
      status: "approved",
      gross_revenue: grossRevenue,
      refunds_total: 0,
      artist_fees_total: totalArtistFees,
      venue_fee: venueFee,
      other_costs: otherCosts,
      stripe_fees: 0,
      platform_fee: 0,
      profit: profit,
    });
    if (settlementErr) {
      console.error("[seedDemoData] Failed to create settlement:", settlementErr);
    }
  }

  // Summary
  const totalTickets = ticketConfigs.reduce((sum, c) => sum + c.earlySold + c.gaSold, 0);
  const totalRevenue = ticketConfigs.reduce((sum, _c, i) => {
    const cfg = ticketConfigs[i];
    return sum + cfg.earlySold * cfg.earlyPrice + cfg.gaSold * cfg.gaPrice;
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
