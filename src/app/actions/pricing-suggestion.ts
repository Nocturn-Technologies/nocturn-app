"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";

export interface PricingSuggestion {
  avgGA: number;
  avgVIP: number;
  minGA: number;
  maxGA: number;
  minVIP: number;
  maxVIP: number;
  competingEvents: number;
  suggestion: string;
  confidence: "high" | "medium" | "low";
}

export async function getTicketPricingSuggestion(input: {
  city: string;
  date: string; // YYYY-MM-DD
  venueCapacity?: number;
}): Promise<{ error: string | null; pricing: PricingSuggestion | null }> {
  try {
    // Validate and sanitize city input
    const city = input.city?.trim();
    if (!city || city.length > 200) {
      return { error: "Invalid city: must be between 1 and 200 characters", pricing: null };
    }
    input = { ...input, city };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", pricing: null };

    // Rate limit: 10 pricing queries per minute per user (expensive DB scans)
    const { success: rlOk } = await rateLimitStrict(`pricing-suggest:${user.id}`, 10, 60_000);
    if (!rlOk) return { error: "Too many requests. Please wait a moment.", pricing: null };

    const admin = createAdminClient();

    // Verify user belongs to at least one collective
    const { count: memberCount } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount || memberCount === 0) return { error: "Not authorized", pricing: null };

    // Find events in the same city within ±7 days of the target date
    const targetDate = new Date(input.date);
    if (isNaN(targetDate.getTime())) {
      return { error: "Invalid date format. Expected YYYY-MM-DD.", pricing: null };
    }
    const weekBefore = new Date(targetDate.getTime() - 7 * 86400000).toISOString();
    const weekAfter = new Date(targetDate.getTime() + 7 * 86400000).toISOString();

    // Also get historical events in the same city (last 90 days) for broader context
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    const [{ data: nearbyEvents }, { data: historicalEvents }] = await Promise.all([
      // Events same week in same city
      admin
        .from("events")
        .select("id, title, starts_at, venues(city, capacity)")
        .in("status", ["published", "completed"])
        .gte("starts_at", weekBefore)
        .lte("starts_at", weekAfter)
        .is("deleted_at", null),
      // Historical events in same city
      admin
        .from("events")
        .select("id, starts_at, venues(city, capacity)")
        .in("status", ["published", "completed"])
        .gte("starts_at", ninetyDaysAgo)
        .is("deleted_at", null),
    ]);

    // Filter to same city
    const cityLower = input.city.toLowerCase();
    const sameCityNearby = (nearbyEvents ?? []).filter((e) => {
      const v = e.venues as unknown as { city: string; capacity: number } | null;
      return v?.city?.toLowerCase().includes(cityLower);
    });

    const sameCityHistorical = (historicalEvents ?? []).filter((e) => {
      const v = e.venues as unknown as { city: string; capacity: number } | null;
      return v?.city?.toLowerCase().includes(cityLower);
    });

    // Get ticket tiers for these events
    const eventIds = [
      ...sameCityNearby.map((e) => e.id),
      ...sameCityHistorical.map((e) => e.id),
    ];

    if (eventIds.length === 0) {
      return {
        error: null,
        pricing: {
          avgGA: 25,
          avgVIP: 60,
          minGA: 15,
          maxGA: 40,
          minVIP: 40,
          maxVIP: 100,
          competingEvents: 0,
          suggestion: `No event data for ${input.city} yet. Based on typical nightlife pricing, we suggest $20-30 GA and $50-75 VIP. Adjust based on your lineup and venue.`,
          confidence: "low",
        },
      };
    }

    const { data: tiers } = await admin
      .from("ticket_tiers")
      .select("name, price, capacity, event_id")
      .in("event_id", eventIds)
      .gt("price", 0); // Exclude free tiers

    if (!tiers || tiers.length === 0) {
      return {
        error: null,
        pricing: {
          avgGA: 25,
          avgVIP: 60,
          minGA: 15,
          maxGA: 40,
          minVIP: 40,
          maxVIP: 100,
          competingEvents: sameCityNearby.length,
          suggestion: `${sameCityNearby.length} events nearby but no pricing data available. Start with $20-30 GA.`,
          confidence: "low",
        },
      };
    }

    // Classify tiers as GA or VIP based on name
    const gaTiers = tiers.filter(
      (t) => !t.name.toLowerCase().includes("vip") && !t.name.toLowerCase().includes("table") && !t.name.toLowerCase().includes("bottle")
    );
    const vipTiers = tiers.filter(
      (t) => t.name.toLowerCase().includes("vip") || t.name.toLowerCase().includes("table") || t.name.toLowerCase().includes("bottle")
    );

    const gaPrices = gaTiers.map((t) => Number(t.price)).filter((p) => p > 0);
    const vipPrices = vipTiers.map((t) => Number(t.price)).filter((p) => p > 0);

    const avgGA = gaPrices.length > 0 ? Math.round(gaPrices.reduce((a, b) => a + b, 0) / gaPrices.length) : 25;
    const avgVIP = vipPrices.length > 0 ? Math.round(vipPrices.reduce((a, b) => a + b, 0) / vipPrices.length) : 60;
    const minGA = gaPrices.length > 0 ? Math.min(...gaPrices) : 15;
    const maxGA = gaPrices.length > 0 ? Math.max(...gaPrices) : 40;
    const minVIP = vipPrices.length > 0 ? Math.min(...vipPrices) : 40;
    const maxVIP = vipPrices.length > 0 ? Math.max(...vipPrices) : 100;

    const confidence = gaPrices.length >= 10 ? "high" : gaPrices.length >= 3 ? "medium" : "low";

    // Generate suggestion
    const competingCount = sameCityNearby.length;
    let suggestion = "";

    if (competingCount >= 3) {
      suggestion = `Busy weekend — ${competingCount} events in ${input.city}. Price competitively at $${Math.max(minGA, avgGA - 5)}-${avgGA} GA to stand out. ${vipPrices.length > 0 ? `VIP around $${avgVIP}.` : ""}`;
    } else if (competingCount === 0) {
      suggestion = `No competing events this weekend. You can price higher — $${avgGA + 5}-${avgGA + 15} GA is safe. ${vipPrices.length > 0 ? `VIP at $${avgVIP + 10}-${avgVIP + 25}.` : ""}`;
    } else {
      suggestion = `${competingCount} other event${competingCount > 1 ? "s" : ""} in ${input.city}. Market rate is $${avgGA} GA. ${vipPrices.length > 0 ? `VIP around $${avgVIP}.` : ""} Match or go slightly above if your lineup is stronger.`;
    }

    // Capacity-based adjustment
    if (input.venueCapacity && input.venueCapacity < 150) {
      suggestion += " Smaller venue = more intimate = you can charge a premium.";
    } else if (input.venueCapacity && input.venueCapacity > 500) {
      suggestion += " Larger venue — price accessibly to fill the room.";
    }

    return {
      error: null,
      pricing: {
        avgGA,
        avgVIP,
        minGA,
        maxGA,
        minVIP,
        maxVIP,
        competingEvents: competingCount,
        suggestion,
        confidence,
      },
    };
  } catch (err) {
    console.error("[getTicketPricingSuggestion]", err);
    return { error: "Something went wrong", pricing: null };
  }
}
