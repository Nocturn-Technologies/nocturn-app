import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Validate redirect is a safe relative path
function safeRedirect(url: string | null, fallback: string): string {
  if (!url) return fallback;
  // Must start with / and not contain // (prevents //evil.com)
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirect(searchParams.get("next"), "/dashboard");
  const redirectTo = safeRedirect(searchParams.get("redirect_to"), "");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // If there's a redirect_to param (e.g. from password reset), use it
      const destination = redirectTo || next;
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // Auth code error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
