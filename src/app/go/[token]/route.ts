import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/config";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

// Promo tokens: alphanumeric + hyphens, 1-100 chars
const TOKEN_FORMAT = /^[a-zA-Z0-9-]{1,100}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!TOKEN_FORMAT.test(token)) {
    return NextResponse.redirect(APP_URL);
  }

  const admin = createAdminClient();

  // Look up the promo link by code
  const { data: link } = await admin
    .from("promo_links")
    .select("id, event_id, code")
    .eq("code", token)
    .maybeSingle();

  if (!link) {
    return NextResponse.redirect(APP_URL);
  }

  let targetUrl: string;

  if (link.event_id) {
    // Nocturn event — redirect to event page with ref param
    const { data: event } = await admin
      .from("events")
      .select("slug, collectives(slug)")
      .eq("id", link.event_id)
      .maybeSingle();

    const ev = event as { slug: string; collectives: { slug: string } | null } | null;
    if (ev?.collectives?.slug) {
      targetUrl = `${APP_URL}/e/${ev.collectives.slug}/${ev.slug}?ref=${link.code}`;
    } else {
      targetUrl = APP_URL;
    }
  } else {
    targetUrl = APP_URL;
  }

  // Log click and increment counter (fire-and-forget — don't block redirect)
  const referrer = request.headers.get("referer") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  void admin
    .from("promo_clicks")
    .insert({ promo_link_id: link.id, referrer, user_agent: userAgent })
    .then(() => {});

  void admin.rpc("increment_promo_click", { p_link_id: link.id }).then(() => {});

  return NextResponse.redirect(targetUrl);
}
