import { NextRequest, NextResponse } from "next/server";
import { sendEventReminders } from "@/app/actions/event-reminders";

/**
 * Cron endpoint: Send reminder emails for events happening tomorrow.
 * Call daily via Vercel Cron or external scheduler.
 * Protected by CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (prevents unauthorized triggers)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendEventReminders();

  return NextResponse.json({
    success: true,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
