"use server";

import { createAdminClient } from "@/lib/supabase/config";
import { rateLimitStrict } from "@/lib/rate-limit";
import { createClient as createServerClient } from "@/lib/supabase/server";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export type NameAvailability =
  | { status: "available" }
  | { status: "taken"; reason: "name" | "slug"; conflictingName: string }
  | { status: "invalid"; reason: string }
  | { status: "error"; reason: string };

/**
 * Live availability check for collective name on Screen 1 of onboarding.
 * Returns whether the name (or its slugified form) collides with an
 * existing collective. This runs while the user types — debounced on the
 * client — so they can fix collisions before hitting Continue.
 *
 * The authoritative check is still in createCollective (race-safe via the
 * unique constraint). This action exists purely for UX feedback.
 */
export async function checkCollectiveNameAvailability(
  rawName: string,
): Promise<NameAvailability> {
  const name = rawName.trim();
  if (!name) return { status: "invalid", reason: "Name is required" };
  if (name.length > 100) {
    return { status: "invalid", reason: "Must be 100 characters or fewer" };
  }

  const slug = slugify(name);
  if (!slug) {
    return { status: "invalid", reason: "Use at least one letter or number" };
  }

  // Auth gate — only logged-in users can poll the collective table.
  // Anonymous polling would let crawlers enumerate the collective namespace.
  const userClient = await createServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { status: "error", reason: "Not authenticated" };
  }

  // Rate limit: 30/min per user — generous enough for fast typing + debounce,
  // tight enough that a leaked session can't crawl the namespace.
  const rl = await rateLimitStrict(`checkCollectiveName:${user.id}`, 30, 60_000);
  if (!rl.success) {
    return { status: "error", reason: "Slow down — try again in a moment" };
  }

  const admin = createAdminClient();

  // Slug match (the unique constraint is on slug, so this is the
  // collision that actually blocks insert).
  const { data: bySlug } = await admin
    .from("collectives")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (bySlug) {
    return { status: "taken", reason: "slug", conflictingName: bySlug.name };
  }

  // Case-insensitive exact name match (catches "MidnightSociety" vs
  // "Midnight Society" — different slugs, same human-readable name).
  const { data: byName } = await admin
    .from("collectives")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();

  if (byName) {
    return { status: "taken", reason: "name", conflictingName: byName.name };
  }

  return { status: "available" };
}
