import { NextRequest, NextResponse } from "next/server";
import { seedDemoData } from "@/app/actions/seed-demo";
import { createClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";

export async function POST(_request: NextRequest) {
  try {
    // Block unless explicitly enabled via ALLOW_SEED — never rely on NODE_ENV alone
    if (!process.env.ALLOW_SEED) {
      return NextResponse.json({ error: "Seed routes disabled" }, { status: 403 });
    }

    // Auth check — only logged-in users can seed
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user's collective
    const { data: membership } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .is("deleted_at", null)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "No admin collective found" }, { status: 403 });
    }

    // Rate limit: 1 request per minute
    const { success: rateLimitOk } = await rateLimitStrict(`seed-demo:${user.id}`, 1, 60_000);
    if (!rateLimitOk) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const result = await seedDemoData(membership.collective_id);

    if (result.error) {
      console.error("[seed-demo] seedDemoData error:", result.error);
      return NextResponse.json({ error: "Failed to seed demo data" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[seed-demo]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
