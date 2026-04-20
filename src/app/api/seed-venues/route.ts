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

    let seeded = 0;

    for (const v of MOCK_VENUES) {
      const slug = slugify(v.name);

      // Check if a venue_profile with this slug already exists
      const { data: existing } = await sb
        .from("venue_profiles")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (existing) continue;

      // Create party first
      const { data: party, error: partyError } = await sb
        .from("parties")
        .insert({ display_name: v.name, type: "venue" })
        .select("id")
        .single();

      if (partyError || !party) {
        console.error("[seed-venues] Failed to insert party:", partyError);
        continue;
      }

      // Create venue_profile linked to party
      const { error: profileError } = await sb
        .from("venue_profiles")
        .insert({
          party_id: party.id,
          slug,
          name: v.name,
          city: v.city,
          address: v.address,
          capacity: v.capacity,
          photo_url: v.photo_url,
        });

      if (profileError) {
        console.error("[seed-venues] Failed to insert venue_profile:", profileError);
        continue;
      }

      seeded++;
    }

    return NextResponse.json({ seeded });
  } catch (err) {
    console.error("[seed-venues]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
