import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sendEmail } from "@/lib/email/send";

function sanitizeSubject(str: string): string {
  return str.replace(/[\r\n\t\x00-\x1f]/g, "").slice(0, 200);
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
import {
  dayOfHypeEmail,
  organizerCountdownEmail,
  inactiveNudgeEmail,
} from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/config";
import { sendEventReminders } from "@/app/actions/event-reminders";
import { DEFAULT_TIMEZONE } from "@/lib/utils";

export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this automatically)
  const authHeader = request.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not set — rejecting request");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    reminders24hr: 0,
    dayOfHype: 0,
    countdown48hr: 0,
    inactiveNudge: 0,
  };

  try {
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
      .is("deleted_at", null)
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", todayEnd.toISOString())
      .limit(500);

    for (const event of todayEvents ?? []) {
      // Check if we already sent day-of hype for this event.
      //
      // CRITICAL: audit_logs has no `event_id` column — the correct FK is
      // `record_id` (with `table_name = 'events'`). The old query filtered
      // on a non-existent column, which PostgREST errored out on, leaving
      // `count` as `null`. `(count ?? 0) > 0` then evaluated `false`, so
      // the dedup check was completely bypassed and every cron run
      // re-spammed every ticket holder "Tonight 🔥" until the event passed.
      const { count } = await sb
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("record_id", event.id)
        .eq("table_name", "events")
        .eq("action", "day_of_hype_sent");

      if ((count ?? 0) > 0) continue;

      const venue = event.venues as unknown as { name: string; city: string } | null;
      const collective = event.collectives as unknown as { slug: string } | null;
      const meta = (event.metadata ?? {}) as Record<string, string>;
      // Format times in the event's local timezone (not the cron host's).
      // Without an explicit `timeZone`, Vercel's cron container renders
      // UTC → attendees see "Doors: 12:00 AM" for a 7pm local show.
      const eventTz = meta.timezone || DEFAULT_TIMEZONE;
      const doorsTime = event.doors_at
        ? new Date(event.doors_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: eventTz })
        : "";
      const showTime = new Date(event.starts_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: eventTz });

      // Get all ticket holders
      const { data: tickets } = await sb
        .from("tickets")
        .select("metadata")
        .eq("event_id", event.id)
        .in("status", ["paid", "checked_in"])
        .limit(10000);

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const emails = new Set<string>();
      for (const t of tickets ?? []) {
        const meta = t.metadata as Record<string, unknown> | null;
        const email = (meta?.email || meta?.customer_email || meta?.buyer_email) as string;
        if (email && emailRegex.test(email)) emails.add(email.toLowerCase().trim());
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
              subject: sanitizeSubject(`Tonight: ${event.title} 🔥`),
              html: htmlWithUnsub,
            });
          })
        );
      }

      // Mark as sent
      const { error: auditError } = await sb.from("audit_logs").insert({
        action: "day_of_hype_sent",
        record_id: event.id,
        table_name: "events",
        new_data: { count: emails.size },
      });
      if (auditError) console.error("[cron] Failed to insert day_of_hype_sent audit log:", auditError);

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
      .is("deleted_at", null)
      .gte("starts_at", in46hr.toISOString())
      .lte("starts_at", in48hr.toISOString())
      .limit(500);

    for (const event of soonEvents ?? []) {
      // Check if already sent — same FK fix as day-of hype above.
      const { count } = await sb
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("record_id", event.id)
        .eq("table_name", "events")
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
        .eq("role", "admin")
        .is("deleted_at", null);

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
          subject: sanitizeSubject(`48 hours: ${event.title} — ${ticketsSold}/${totalCap} sold`),
          html,
        });
      }

      const { error: countdownAuditError } = await sb.from("audit_logs").insert({
        action: "countdown_48hr_sent",
        record_id: event.id,
        table_name: "events",
        new_data: { ticketsSold, totalCap },
      });
      if (countdownAuditError) console.error("[cron] Failed to insert countdown_48hr_sent audit log:", countdownAuditError);

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
        .is("deleted_at", null)
        .limit(100);

      for (const col of collectives ?? []) {
        // Check last event date
        const { data: lastEvent } = await sb
          .from("events")
          .select("created_at")
          .eq("collective_id", col.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastEvent && new Date(lastEvent.created_at) > thirtyDaysAgo) continue;

        // Check if we already nudged this month. Old query filtered on
        // `metadata->>collective_id` but audit_logs has no `metadata` column
        // — the payload lives in `new_data`, and the collective id is
        // stored as `record_id`. Same bug as day-of hype above → the dedup
        // was bypassed, so inactive collectives received the nudge every
        // Monday of the month instead of once.
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const { count: nudgeCount } = await sb
          .from("audit_logs")
          .select("*", { count: "exact", head: true })
          .eq("action", "inactive_nudge_sent")
          .eq("table_name", "collectives")
          .eq("record_id", col.id)
          .gte("created_at", monthStart.toISOString());

        if ((nudgeCount ?? 0) > 0) continue;

        // Get admin
        const { data: admins } = await sb
          .from("collective_members")
          .select("users(email, full_name)")
          .eq("collective_id", col.id)
          .eq("role", "admin")
          .is("deleted_at", null)
          .limit(1);

        const admin = admins?.[0]?.users as unknown as { email: string; full_name: string } | null;
        if (!admin?.email) continue;

        const lastDate = lastEvent
          ? new Date(lastEvent.created_at).toLocaleDateString("en", { month: "long", day: "numeric" })
          : null;

        const html = inactiveNudgeEmail(col.name, admin.full_name?.split(" ")[0] ?? "there", lastDate);

        await sendEmail({
          to: admin.email,
          subject: sanitizeSubject(`${col.name} — the scene needs you 🌙`),
          html,
        });

        const { error: nudgeAuditError } = await sb.from("audit_logs").insert({
          action: "inactive_nudge_sent",
          record_id: col.id,
          table_name: "collectives",
          new_data: { collective_id: col.id },
        });
        if (nudgeAuditError) console.error("[cron] Failed to insert inactive_nudge_sent audit log:", nudgeAuditError);

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
  } catch (err) {
    console.error("[cron/reminders]", err);
    return NextResponse.json(
      { ok: false, error: "Internal cron error" },
      { status: 500 }
    );
  }
}
