"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { randomUUID } from "crypto";

/**
 * Seeds a demo collective with realistic past events, ticket sales,
 * settlements, and attendee data. Run once for Techstars demos.
 * 
 * Call from browser console: fetch('/api/seed-demo', { method: 'POST' })
 */
export async function seedDemoData(collectiveId: string) {
  if (!process.env.ALLOW_SEED) {
    return { error: "Seeding is disabled" };
  }

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

  // Verify user is a member of this collective
  const { count: memberCount } = await sb
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", collectiveId)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) return { error: "Not a member of this collective" };

  // Create 3 demo venues
  const venues = [
    { name: "The Velvet Underground", slug: "velvet-underground-to", address: "508 Queen St W", city: "Toronto", capacity: 350, contact_email: "bookings@velvetunderground.com" },
    { name: "CODA", slug: "coda-to", address: "794 Bathurst St", city: "Toronto", capacity: 500, contact_email: "info@codatoronto.com" },
    { name: "Nocturne Bar", slug: "nocturne-bar-to", address: "455 Spadina Ave", city: "Toronto", capacity: 200, contact_email: "events@nocturnebar.com" },
  ];

  const { data: insertedVenues } = await sb
    .from("venues")
    .upsert(venues, { onConflict: "slug" })
    .select("id, name, capacity");

  if (!insertedVenues || insertedVenues.length === 0) {
    return { error: "Failed to create venues" };
  }

  // Create 3 demo artists
  const artists = [
    { name: "DJ Koda", slug: "dj-koda", genre: ["House", "Techno"], default_fee: 400 },
    { name: "Nadia Night", slug: "nadia-night", genre: ["Deep House", "Afro House"], default_fee: 600 },
    { name: "Pulse Collective", slug: "pulse-collective", genre: ["Drum & Bass", "Jungle"], default_fee: 350 },
  ];

  const { data: insertedArtists } = await sb
    .from("artists")
    .upsert(artists, { onConflict: "slug" })
    .select("id, name, default_fee");

  if (!insertedArtists) return { error: "Failed to create artists" };

  // Create 3 past events (completed, with realistic dates)
  const now = new Date();
  const events = [
    {
      collective_id: collectiveId,
      venue_id: insertedVenues[0].id,
      title: "Deep Frequencies Vol. 3",
      slug: "deep-frequencies-vol-3",
      status: "completed",
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
      status: "completed",
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
      status: "completed",
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
    return { error: `Failed to create events: ${eventError?.message}` };
  }

  // Create ticket tiers + tickets + settlements for each event
  const ticketConfigs = [
    { earlyPrice: 15, gaPrice: 25, vipPrice: 45, earlySold: 60, gaSold: 120, vipSold: 20 },
    { earlyPrice: 20, gaPrice: 30, vipPrice: 50, earlySold: 80, gaSold: 150, vipSold: 30 },
    { earlyPrice: 10, gaPrice: 20, vipPrice: 35, earlySold: 40, gaSold: 80, vipSold: 15 },
  ];

  for (let i = 0; i < insertedEvents.length; i++) {
    const event = insertedEvents[i];
    const config = ticketConfigs[i];

    // Create tiers
    const tiers = [
      { event_id: event.id, name: "Early Bird", price: config.earlyPrice, capacity: config.earlySold },
      { event_id: event.id, name: "General Admission", price: config.gaPrice, capacity: config.gaSold + 50 },
      { event_id: event.id, name: "VIP", price: config.vipPrice, capacity: config.vipSold + 10 },
    ];

    const { data: insertedTiers } = await sb
      .from("ticket_tiers")
      .insert(tiers)
      .select("id, name, price");

    if (!insertedTiers) continue;

    // Create tickets (all checked_in for past events)
    const soldCounts = [config.earlySold, config.gaSold, config.vipSold];
    const allTickets: Array<{
      event_id: string;
      ticket_tier_id: string;
      status: string;
      price_paid: number;
      currency: string;
      ticket_token: string;
      metadata: Record<string, unknown>;
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
      await sb.from("tickets").insert(allTickets.slice(batch, batch + 100));
    }

    // Book artists
    const artistIndex = i % insertedArtists.length;
    const secondArtist = (i + 1) % insertedArtists.length;
    await sb.from("event_artists").insert([
      { event_id: event.id, artist_id: insertedArtists[artistIndex].id, fee: insertedArtists[artistIndex].default_fee, status: "confirmed" },
      { event_id: event.id, artist_id: insertedArtists[secondArtist].id, fee: insertedArtists[secondArtist].default_fee, status: "confirmed" },
    ]);

    // Calculate and create settlement
    const grossRevenue = config.earlySold * config.earlyPrice
      + config.gaSold * config.gaPrice
      + config.vipSold * config.vipPrice;
    const totalTickets = config.earlySold + config.gaSold + config.vipSold;
    const stripeFees = Math.round((grossRevenue * 0.029 + totalTickets * 0.30) * 100) / 100;
    const totalArtistFees = (insertedArtists[artistIndex].default_fee ?? 0) + (insertedArtists[secondArtist].default_fee ?? 0);
    const platformFee = 0; // Buyer pays — organizer keeps 100%

    const netRevenue = grossRevenue - stripeFees - platformFee;
    const profit = netRevenue - totalArtistFees;

    await sb.from("settlements").insert({
      event_id: event.id,
      collective_id: collectiveId,
      status: "approved",
      gross_revenue: grossRevenue,
      stripe_fees: stripeFees,
      platform_fee: platformFee,
      net_revenue: netRevenue,
      total_costs: 0,
      total_artist_fees: totalArtistFees,
      profit: profit,
    });
  }

  // Summary
  const totalTickets = ticketConfigs.reduce((sum, c) => sum + c.earlySold + c.gaSold + c.vipSold, 0);
  const totalRevenue = ticketConfigs.reduce((sum, _c, i) => {
    const cfg = ticketConfigs[i];
    return sum + cfg.earlySold * cfg.earlyPrice + cfg.gaSold * cfg.gaPrice + cfg.vipSold * cfg.vipPrice;
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
}
