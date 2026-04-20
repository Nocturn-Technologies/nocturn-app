"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface OnboardingEventInput {
  collectiveSlug: string;
  title: string;
  startsAt: string; // ISO string
  venue: string | null;
  tierName: string;
  tierPrice: number;
  vibeTags: string[];
}

/**
 * Simplified event creation for onboarding flow.
 * Creates a draft event with one ticket tier — minimal fields, no venue required.
 */
export async function createOnboardingEvent(input: OnboardingEventInput) {
  try {
  // Input validation
  if (!input.collectiveSlug || input.collectiveSlug.length > 100) return { error: "Invalid collective slug.", eventSlug: null };
  if (!input.title || input.title.length > 200) return { error: "Title is required and must be under 200 characters.", eventSlug: null };
  if (!input.startsAt || isNaN(Date.parse(input.startsAt))) return { error: "Invalid date.", eventSlug: null };
  if (input.tierPrice < 0 || input.tierPrice > 10000 || !Number.isFinite(input.tierPrice)) return { error: "Invalid price.", eventSlug: null };
  if (!Array.isArray(input.vibeTags) || input.vibeTags.length > 10 || input.vibeTags.some(t => typeof t !== "string" || t.length > 50)) {
    return { error: "Invalid vibe tags.", eventSlug: null };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in.", eventSlug: null };
  }

  const admin = createAdminClient();

  // Find the collective by slug
  const { data: collective, error: collectiveError } = await admin
    .from("collectives")
    .select("id")
    .eq("slug", input.collectiveSlug)
    .maybeSingle();

  if (collectiveError) {
    console.error("[createOnboardingEvent]", collectiveError);
    return { error: "Something went wrong", eventSlug: null };
  }
  if (!collective) {
    return { error: "Collective not found.", eventSlug: null };
  }

  // Verify user is a member
  const { data: membership, error: memberError } = await admin
    .from("collective_members")
    .select("id")
    .eq("collective_id", collective.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (memberError) {
    console.error("[createOnboardingEvent]", memberError);
    return { error: "Something went wrong", eventSlug: null };
  }
  if (!membership) {
    return { error: "You're not a member of this collective.", eventSlug: null };
  }

  // Create event slug
  const baseSlug = slugify(input.title);
  let eventSlug = baseSlug || `event-${Date.now()}`;

  // Check slug uniqueness
  const { data: slugCheck } = await admin
    .from("events")
    .select("id")
    .eq("slug", eventSlug)
    .maybeSingle();

  if (slugCheck) {
    // Retry up to 5 times with random suffixes to avoid slug collisions
    let resolved = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: recheck } = await admin
        .from("events")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!recheck) {
        eventSlug = candidate;
        resolved = true;
        break;
      }
    }
    if (!resolved) {
      // Final fallback: append timestamp for guaranteed uniqueness
      eventSlug = `${baseSlug}-${Date.now().toString(36)}`;
    }
  }

  // Parse the starts_at time and set doors 1hr before, ends 5hrs after
  const startsAt = new Date(input.startsAt);
  const doorsAt = new Date(startsAt.getTime() - 60 * 60 * 1000); // 1hr before
  const endsAt = new Date(startsAt.getTime() + 5 * 60 * 60 * 1000); // 5hrs after

  const isFree = input.tierPrice === 0;
  // Publish free events immediately; paid events start as draft (need Stripe setup)
  const status = isFree ? "published" : "draft";

  // venue_name is a flat text column on events — no venue FK needed.
  const venueName = input.venue && input.venue.trim() ? input.venue.trim() : null;

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      title: input.title,
      slug: eventSlug,
      description: null,
      collective_id: collective.id,
      venue_name: venueName,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      doors_at: doorsAt.toISOString(),
      status,
      is_free: isFree,
      is_published: isFree,
      vibe_tags: input.vibeTags,
      metadata: { source: "onboarding" },
    })
    .select("id, slug")
    .maybeSingle();

  if (eventError) {
    console.error("[createOnboardingEvent]", eventError);
    return { error: "Something went wrong", eventSlug: null };
  }

  if (!event) {
    return { error: "Failed to create event.", eventSlug: null };
  }

  // Create ticket tier — sale_start_at not sales_start
  const { error: tierError } = await admin
    .from("ticket_tiers")
    .insert({
      event_id: event.id,
      name: input.tierName,
      price: input.tierPrice,
      capacity: 100, // Default capacity
      sort_order: 0,
    });

  if (tierError) {
    console.error("[createOnboardingEvent] tier insert failed:", tierError);
    // Non-fatal — event exists, tier can be added later
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");

  return { error: null, eventSlug: event.slug };
  } catch (err) {
    console.error("[createOnboardingEvent]", err);
    return { error: "Something went wrong", eventSlug: null };
  }
}
