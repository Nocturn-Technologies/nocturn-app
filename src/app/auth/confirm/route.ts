import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Validate redirect is a safe relative path. Mirrors the helper in
// src/app/api/auth/callback/route.ts — rejects protocol-relative URLs,
// backslashes, and encoded slashes to prevent open-redirect bypass.
function safeRedirect(url: string | null, fallback: string): string {
  if (!url) return fallback;
  // Reject encoded slashes before decoding to prevent bypass
  if (/%2f/i.test(url) || /%5c/i.test(url)) return fallback;
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.includes("\\")) {
      return decoded;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const redirectTo = safeRedirect(searchParams.get("redirect_to"), "/dashboard");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "recovery" | "email" | "signup",
    });

    if (!error) {
      // For recovery (password reset), redirect to the reset page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/reset-password`);
      }
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_token`);
}
