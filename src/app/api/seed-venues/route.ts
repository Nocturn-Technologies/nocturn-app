import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";
import { MOCK_VENUES } from "@/lib/mock-venues";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST() {
  // Auth check
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sb = admin();

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
