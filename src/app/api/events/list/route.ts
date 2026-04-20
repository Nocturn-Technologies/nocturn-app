import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const clientIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { success } = await rateLimitStrict(`events-list:${clientIp}`, 30, 60000); // 30 requests per minute
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.min(10000, Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = (page - 1) * limit;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: memberships } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

    if (collectiveIds.length === 0) {
      return NextResponse.json({ events: [], page, limit, total: 0 });
    }

    const { data: events, count } = await supabase
      .from("events")
      .select("id, title, status, starts_at", { count: "exact" })
      .in("collective_id", collectiveIds)
      .order("starts_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({ events: events ?? [], page, limit, total: count ?? 0 });
  } catch (error) {
    console.error("[api/events/list] Error:", error);
    return NextResponse.json({ events: [], error: "Internal error" }, { status: 500 });
  }
}
