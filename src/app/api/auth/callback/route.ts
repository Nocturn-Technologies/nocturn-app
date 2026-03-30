import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";

// Validate redirect is a safe relative path
function safeRedirect(url: string | null, fallback: string): string {
  if (!url) return fallback;
  // Reject encoded slashes before decoding to prevent bypass
  if (/%2f/i.test(url) || /%5c/i.test(url)) return fallback;
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.includes('\\')) return decoded;
  } catch {
    return fallback;
  }
  return fallback;
}

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { success } = await rateLimitStrict(`auth-callback:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
