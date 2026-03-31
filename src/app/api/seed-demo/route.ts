import { NextRequest, NextResponse } from "next/server";
import { seedDemoData } from "@/app/actions/seed-demo";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest) {
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

  const result = await seedDemoData(membership.collective_id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
