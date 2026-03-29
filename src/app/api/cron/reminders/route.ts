import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import {
  dayOfHypeEmail,
  organizerCountdownEmail,
  inactiveNudgeEmail,
} from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/config";
import { sendEventReminders } from "@/app/actions/event-reminders";

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set — rejecting request");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    reminders24hr: 0,
    dayOfHype: 0,
    countdown48hr: 0,
    inactiveNudge: 0,
  };

  const sb = createAdminClient();
  const now = new Date();

  // ── 1. 24hr Event Reminders (existing) ──
  try {
    await sendEventReminders();
    results.reminders24hr = 1;
  } catch (e) {
    console.error("[cron] 24hr reminders failed:", e);
  }

  // ── 2. Day-of Hype Emails ("Tonight.") ──
  try {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const { data: todayEvents } = await sb
      .from("events")
      .select("id, title, slug, starts_at, doors_at, metadata, venues(name, address, city), collectives(slug)")
      .eq("status", "published")
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", todayEnd.toISOString());

    for (const event of todayEvents ?? []) {
      // Check if we already sent day-of hype for this event
      const { count } = await sb
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("action", "day_of_hype_sent");

      if ((count ?? 0) > 0) continue;

      const venue = event.venues as unknown as { name: string; city: string } | null;
      const collective = event.collectives as unknown as { slug: string } | null;
      const meta = (event.metadata ?? {}) as Record<string, string>;
      const doorsTime = event.doors_at
        ? new Date(event.doors_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
        : "";
      const showTime = new Date(event.starts_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });

      // Get all ticket holders
      const { data: tickets } = await sb
        .from("tickets")
        .select("metadata")
        .eq("event_id", event.id)
        .in("status", ["paid", "checked_in"]);

      const emails = new Set<string>();
      for (const t of tickets ?? []) {
        const meta = t.metadata as Record<string, unknown> | null;
        const email = (meta?.email || meta?.customer_email || meta?.buyer_email) as string;
        if (email) emails.add(email);
      }

      const html = dayOfHypeEmail(
        event.title,
        venue?.name ?? "TBA",
        doorsTime,
        showTime,
        meta.dressCode ?? null,
        collective?.slug && event.slug
          ? `https://app.trynocturn.com/e/${collective.slug}/${event.slug}`
          : `https://app.trynocturn.com/dashboard/events/${event.id}`
      );

      // Send in batches of 50
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
      const emailArr = Array.from(emails);
      for (let i = 0; i < emailArr.length; i += 50) {
        const batch = emailArr.slice(i, i + 50);
        await Promise.allSettled(
          batch.map((to) => {
            // Append unsubscribe link for CAN-SPAM compliance
            const htmlWithUnsub = html + `<p style="text-align:center;margin-top:24px;font-size:11px;color:#71717A;">To stop receiving emails, <a href="${appUrl}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#7B2FF7;text-decoration:underline;">unsubscribe here</a>.</p>`;
            return sendEmail({
              to,
              subject: `Tonight: ${event.title} 🔥`,
              html: htmlWithUnsub,
            });
          })
        );
      }

      // Mark as sent
      await sb.from("audit_logs").insert({
        event_id: event.id,
        action: "day_of_hype_sent",
        metadata: { count: emails.size },
      });

      results.dayOfHype += emails.size;
    }
  } catch (e) {
    console.error("[cron] day-of hype failed:", e);
  }

  // ── 3. 48hr Organizer Countdown ──
  try {
    const in48hr = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in46hr = new Date(now.getTime() + 46 * 60 * 60 * 1000);

    const { data: soonEvents } = await sb
      .from("events")
      .select("id, title, starts_at, collective_id")
      .eq("status", "published")
      .gte("starts_at", in46hr.toISOString())
      .lte("starts_at", in48hr.toISOString());

    for (const event of soonEvents ?? []) {
      // Check if already sent
      const { count } = await sb
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("action", "countdown_48hr_sent");

      if ((count ?? 0) > 0) continue;

      // Get ticket stats
      const [{ count: ticketsSold }, { data: tiers }, { data: ticketRevenue }] = await Promise.all([
        sb.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", event.id).in("status", ["paid", "checked_in"]),
        sb.from("ticket_tiers").select("capacity, price").eq("event_id", event.id),
        sb.from("tickets").select("price_paid").eq("event_id", event.id).in("status", ["paid", "checked_in"]),
      ]);

      const totalCap = (tiers ?? []).reduce((s, t) => s + (t.capacity || 0), 0);
      const revenue = (ticketRevenue ?? []).reduce((s: number, t: { price_paid: unknown }) => s + (Number(t.price_paid) || 0), 0);

      // Get organizer email
      const { data: members } = await sb
        .from("collective_members")
        .select("user_id, users(email, full_name)")
        .eq("collective_id", event.collective_id)
        .eq("role", "admin");

      const eventDate = new Date(event.starts_at).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });

      for (const m of members ?? []) {
        const user = m.users as unknown as { email: string; full_name: string } | null;
        if (!user?.email) continue;

        const html = organizerCountdownEmail(
          event.title,
          eventDate,
          ticketsSold ?? 0,
          totalCap,
          `$${revenue.toLocaleString()}`,
          `https://app.trynocturn.com/dashboard/events/${event.id}`
        );

        await sendEmail({
          to: user.email,
          subject: `48 hours: ${event.title} — ${ticketsSold}/${totalCap} sold`,
          html,
        });
      }

      await sb.from("audit_logs").insert({
        event_id: event.id,
        action: "countdown_48hr_sent",
        metadata: { ticketsSold, totalCap },
      });

      results.countdown48hr++;
    }
  } catch (e) {
    console.error("[cron] 48hr countdown failed:", e);
  }

  // ── 4. Inactive Collective Nudge (weekly — only run on Mondays) ──
  try {
    if (now.getDay() === 1) { // Monday only
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all collectives with their last event
      const { data: collectives } = await sb
        .from("collectives")
        .select("id, name, metadata")
        .limit(100);

      for (const col of collectives ?? []) {
        // Check last event date
        const { data: lastEvent } = await sb
          .from("events")
          .select("created_at")
          .eq("collective_id", col.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastEvent && new Date(lastEvent.created_at) > thirtyDaysAgo) continue;

        // Check if we already nudged this month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const { count: nudgeCount } = await sb
          .from("audit_logs")
          .select("*", { count: "exact", head: true })
          .eq("action", "inactive_nudge_sent")
          .gte("created_at", monthStart.toISOString())
          .eq("metadata->>collective_id", col.id);

        if ((nudgeCount ?? 0) > 0) continue;

        // Get admin
        const { data: admins } = await sb
          .from("collective_members")
          .select("users(email, full_name)")
          .eq("collective_id", col.id)
          .eq("role", "admin")
          .limit(1);

        const admin = admins?.[0]?.users as unknown as { email: string; full_name: string } | null;
        if (!admin?.email) continue;

        const lastDate = lastEvent
          ? new Date(lastEvent.created_at).toLocaleDateString("en", { month: "long", day: "numeric" })
          : null;

        const html = inactiveNudgeEmail(col.name, admin.full_name.split(" ")[0], lastDate);

        await sendEmail({
          to: admin.email,
          subject: `${col.name} — the scene needs you 🌙`,
          html,
        });

        await sb.from("audit_logs").insert({
          action: "inactive_nudge_sent",
          metadata: { collective_id: col.id },
        });

        results.inactiveNudge++;
      }
    }
  } catch (e) {
    console.error("[cron] inactive nudge failed:", e);
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    results,
  });
}
