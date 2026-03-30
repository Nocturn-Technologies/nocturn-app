"use server";

import { randomUUID } from "crypto";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

function detectPlatform(url: string): string {
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

function generateToken(): string {
  // Short, URL-safe token: 8 chars from UUID
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function addExternalEvent(data: {
  title: string;
  externalUrl: string;
  eventDate?: string;
  venueName?: string;
}) {
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
  const platform = detectPlatform(data.externalUrl);

  // Create external event
  const { data: extEvent, error: insertError } = await admin
    .from("external_events")
    .insert({
      promoter_id: user.id,
      title: data.title,
      external_url: data.externalUrl,
      platform,
      event_date: data.eventDate || null,
      venue_name: data.venueName || null,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !extEvent) {
    return { error: insertError?.message || "Failed to create event", link: null };
  }

  // Create tracked promo link with collision retry
  let token = "";
  let linkError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    token = generateToken();
    const { error } = await admin
      .from("promo_links")
      .insert({
        promoter_id: user.id,
        external_event_id: extEvent.id,
        token,
      });

    if (!error) {
      linkError = null;
      break;
    }

    // 23505 = unique_violation — retry with a new token
    if (error.code === "23505") {
      linkError = error;
      continue;
    }

    // Any other error — bail immediately
    return { error: error.message, link: null };
  }

  if (linkError) {
    return { error: "Failed to generate unique link. Please try again.", link: null };
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  return { error: null, link: `${APP_URL}/go/${token}` };
}

export async function getPromoterExternalEvents() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();

  const { data } = await admin
    .from("external_events")
    .select("id, title, external_url, platform, event_date, venue_name, promo_links(token, click_count)")
    .eq("promoter_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    external_url: string;
    platform: string | null;
    event_date: string | null;
    venue_name: string | null;
    promo_links: { token: string; click_count: number }[] | null;
  }[]).map((e) => ({
    id: e.id,
    title: e.title,
    externalUrl: e.external_url,
    platform: e.platform,
    eventDate: e.event_date,
    venueName: e.venue_name,
    token: e.promo_links?.[0]?.token ?? null,
    clickCount: e.promo_links?.[0]?.click_count ?? 0,
  }));
}

export async function deleteExternalEvent(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Soft delete — only if owned by this user
  const { error } = await admin
    .from("external_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("promoter_id", user.id);

  return { error: error?.message ?? null };
}
