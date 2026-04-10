import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { MOCK_VENUES } from "@/lib/mock-venues";
import { rateLimitStrict } from "@/lib/rate-limit";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST() {
  try {
    // Block unless explicitly enabled via ALLOW_SEED — never rely on NODE_ENV alone
    if (!process.env.ALLOW_SEED) {
      return NextResponse.json({ error: 'Seed routes disabled' }, { status: 403 });
    }

    // Auth check
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Admin role check — only collective owners can seed
    const { data: ownership } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .is("deleted_at", null)
      .maybeSingle();

    if (!ownership) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Rate limit: 1 request per minute
    const { success: rateLimitOk } = await rateLimitStrict(`seed-venues:${user.id}`, 1, 60_000);
    if (!rateLimitOk) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const sb = createAdminClient();

    const venues = MOCK_VENUES.map((v) => ({
      name: v.name,
      slug: slugify(v.name),
      address: v.address,
      city: v.city,
      capacity: v.capacity,
      contact_email: null,
      latitude: v.latitude,
      longitude: v.longitude,
      metadata: {
        venue_type: v.venue_type,
        neighbourhood: v.neighbourhood,
        rating: v.rating,
        review_count: v.review_count,
        phone: v.phone,
        website: v.website,
        hours: v.hours,
      },
    }));

    const { data, error } = await sb
      .from("venues")
      .upsert(venues, { onConflict: "slug" })
      .select("id, name");

    if (error) {
      console.error("[seed-venues] Upsert failed:", error);
      return NextResponse.json({ error: "Failed to seed venues" }, { status: 500 });
    }

    return NextResponse.json({ seeded: data?.length ?? 0 });
  } catch (err) {
    console.error("[seed-venues]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
