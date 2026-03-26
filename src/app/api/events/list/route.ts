import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function createAdminClient() {
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ events: [] }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: memberships } = await admin
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

    if (collectiveIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const { data: events } = await admin
      .from("events")
      .select("id, title, status, starts_at")
      .in("collective_id", collectiveIds)
      .order("starts_at", { ascending: false });

    return NextResponse.json({ events: events ?? [] });
  } catch (error) {
    console.error("[api/events/list] Error:", error);
    return NextResponse.json({ events: [], error: "Internal error" }, { status: 500 });
  }
}
