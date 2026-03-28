import { NextResponse } from "next/server";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
  return NextResponse.redirect(`${appUrl}/dashboard/settings?stripe=connected`);
}
