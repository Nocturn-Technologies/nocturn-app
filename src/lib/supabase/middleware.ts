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

  let approvalState:
    | {
        is_approved: boolean;
      }
    | null = null;

  if (user) {
    const { data } = await supabase
      .from("users")
      .select("is_approved")
      .eq("id", user.id)
      .maybeSingle();

    approvalState = data;
  }

  // Protect dashboard routes
  if (!user && (request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/onboarding"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Check approval gate for onboarding too — prevent unapproved collectives from creating records
  if (user && request.nextUrl.pathname.startsWith("/onboarding")) {
    if (approvalState?.is_approved === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }
  }

  // Check approval gate for all beta users
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    if (approvalState?.is_approved === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }
  }

  // If approved user visits pending-approval, redirect to dashboard
  if (user && request.nextUrl.pathname === "/pending-approval") {
    if (approvalState?.is_approved !== false) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
