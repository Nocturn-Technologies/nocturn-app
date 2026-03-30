import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { MOCK_VENUES } from "@/lib/mock-venues";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST() {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seeded: data?.length ?? 0 });
}
