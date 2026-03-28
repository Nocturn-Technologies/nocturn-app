import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (!user && (request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/onboarding"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Check if user has been denied
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const isDenied = user.user_metadata?.is_denied;
    if (isDenied === true) {
      const url = request.nextUrl.clone();
      url.pathname = "/account-denied";
      return NextResponse.redirect(url);
    }
  }

  // Check approval gate for collective/promoter users
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const userType = user.user_metadata?.user_type;
    const isApproved = user.user_metadata?.is_approved;

    // Only gate collectives and promoters; marketplace types are auto-approved
    if ((userType === "collective" || userType === "promoter") && isApproved === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }
  }

  // If non-denied user visits account-denied, redirect to dashboard
  if (user && request.nextUrl.pathname === "/account-denied") {
    const isDenied = user.user_metadata?.is_denied;
    if (isDenied !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // If approved user visits pending-approval, redirect to dashboard
  if (user && request.nextUrl.pathname === "/pending-approval") {
    const isApproved = user.user_metadata?.is_approved;
    if (isApproved !== false) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
