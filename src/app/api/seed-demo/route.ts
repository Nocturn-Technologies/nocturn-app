import { NextRequest, NextResponse } from "next/server";
import { seedDemoData } from "@/app/actions/seed-demo";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
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
