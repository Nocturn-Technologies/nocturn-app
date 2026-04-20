"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

function detectSource(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("eventbrite")) return "eventbrite";
    if (host.includes("posh.vip")) return "posh";
    if (host.includes("ra.co")) return "ra";
    if (host.includes("dice.fm")) return "dice";
    if (host.includes("shotgun.live")) return "shotgun";
    if (host.includes("partiful")) return "partiful";
    return "other";
  } catch {
    return "other";
  }
}

/**
 * Save an external event reference for the collective's competitive intelligence feed.
 * The external_events table stores scraped/submitted event data with no Stripe attachment.
 */
export async function addExternalEvent(data: {
  title: string;
  externalUrl: string;
  eventDate?: string;
  venueName?: string;
}) {
  try {
    if (!data.title?.trim() || !data.externalUrl?.trim()) {
      return { error: "Title and URL are required", link: null };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", link: null };

    // Validate URL — only HTTPS allowed to prevent open redirect
    try {
      const parsed = new URL(data.externalUrl);
      if (parsed.protocol !== "https:") {
        return { error: "Only HTTPS URLs are allowed", link: null };
      }
    } catch {
      return { error: "Invalid URL", link: null };
    }

    const admin = createAdminClient();

    // Resolve the user's collective (use their primary collective from users table)
    const { data: userRow } = await admin
      .from("users")
      .select("collective_id")
      .eq("id", user.id)
      .maybeSingle();

    const source = detectSource(data.externalUrl);

    // Insert into external_events — schema: collective_id, title, source, source_url,
    // venue_name, city, starts_at, ticket_price, metadata, scraped_at
    const { data: extEvent, error: insertError } = await admin
      .from("external_events")
      .insert({
        collective_id: userRow?.collective_id ?? null,
        title: data.title.trim().slice(0, 255),
        source,
        source_url: data.externalUrl,
        venue_name: data.venueName?.trim().slice(0, 255) ?? null,
        starts_at: data.eventDate ?? null,
        metadata: { submitted_by: user.id },
      })
      .select("id")
      .maybeSingle();

    if (insertError || !extEvent) {
      console.error("[addExternalEvent] insert error:", insertError);
      return { error: "Failed to create event", link: null };
    }

    // Return the source URL as the canonical link (no promo tracking on external events)
    return { error: null, link: data.externalUrl };
  } catch (err) {
    console.error("[addExternalEvent]", err);
    return { error: "Something went wrong", link: null };
  }
}

/**
 * Get external events for the current user's collective.
 */
export async function getPromoterExternalEvents() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const admin = createAdminClient();

    const { data: userRow } = await admin
      .from("users")
      .select("collective_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userRow?.collective_id) return [];

    const { data, error } = await admin
      .from("external_events")
      .select("id, title, source, source_url, venue_name, city, starts_at, ticket_price, scraped_at")
      .eq("collective_id", userRow.collective_id)
      .order("scraped_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[getPromoterExternalEvents] query error:", error.message);
      return [];
    }

    return ((data ?? []) as Array<{
      id: string;
      title: string;
      source: string | null;
      source_url: string | null;
      venue_name: string | null;
      city: string | null;
      starts_at: string | null;
      ticket_price: number | null;
      scraped_at: string;
    }>).map((e) => ({
      id: e.id,
      title: e.title,
      externalUrl: e.source_url,
      platform: e.source,
      eventDate: e.starts_at,
      venueName: e.venue_name,
      city: e.city,
      ticketPrice: e.ticket_price,
      scrapedAt: e.scraped_at,
      token: null as string | null,
      clickCount: 0,
    }));
  } catch (err) {
    console.error("[getPromoterExternalEvents]", err);
    return [];
  }
}

/**
 * Delete an external event record.
 * Only members of the associated collective can delete.
 */
export async function deleteExternalEvent(eventId: string) {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required" };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();

    // Verify ownership via collective membership
    const { data: extEvent } = await admin
      .from("external_events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!extEvent) return { error: "Event not found" };

    if (extEvent.collective_id) {
      const { count: memberCount } = await admin
        .from("collective_members")
        .select("*", { count: "exact", head: true })
        .eq("collective_id", extEvent.collective_id)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (!memberCount || memberCount === 0) {
        return { error: "Not authorized" };
      }
    }

    const { error } = await admin
      .from("external_events")
      .delete()
      .eq("id", eventId);

    if (error) return { error: "Failed to delete event" };
    return { error: null };
  } catch (err) {
    console.error("[deleteExternalEvent]", err);
    return { error: "Something went wrong" };
  }
}
