// Internal cron utility — NOT a server action (only called by cron API route)
import { sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/config";
import { DEFAULT_TIMEZONE } from "@/lib/utils";
import { escapeHtml } from "@/lib/html";

/**
 * Send reminder emails to all ticket holders for events happening in the next 24 hours.
 * Designed to be called by a cron job or manual trigger.
 *
 * Buyer emails are resolved via orders → party_contact_methods (type='email'),
 * since tickets no longer store metadata directly.
 */
export async function sendEventReminders() {
  try {
  const sb = createAdminClient();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find events starting in the next 24 hours that haven't had reminders sent.
  // Events now use flat venue_name/venue_address columns (no venue FK).
  // collective slug is fetched separately since events only store collective_id.
  const { data: events, error: eventsError } = await sb
    .from("events")
    .select("id, title, slug, starts_at, doors_at, metadata, collective_id, venue_name, venue_address")
    .in("status", ["published", "upcoming"])
    .gte("starts_at", now.toISOString())
    .lte("starts_at", tomorrow.toISOString());

  if (eventsError) {
    console.error("[sendEventReminders] events query error:", eventsError.message);
    return { sent: 0, events: 0 };
  }

  if (!events || events.length === 0) {
    return { sent: 0, events: 0 };
  }

  // Fetch collective slugs + names for all events in one query.
  const collectiveIds = [...new Set(events.map((e) => e.collective_id))];
  const { data: collectivesData } = await sb
    .from("collectives")
    .select("id, name, slug")
    .in("id", collectiveIds);

  const collectiveMap = new Map(
    (collectivesData ?? []).map((c) => [c.id, c])
  );

  let totalSent = 0;
  let eventsProcessed = 0;

  for (const event of events) {
    const meta = (event.metadata as Record<string, unknown>) || {};

    // Skip if reminders already sent for this event.
    if (meta.reminders_sent) continue;

    const collective = collectiveMap.get(event.collective_id) ?? null;

    if (!collective) {
      console.warn(`[reminders] Event ${event.id} has no collective, skipping`);
      continue;
    }

    // Get all ticket holders' emails via orders → party_contact_methods.
    // Tickets link to order_lines → orders → parties.
    // party_contact_methods stores email addresses by type='email'.
    const { data: eventOrders, error: ordersError } = await sb
      .from("orders")
      .select("party_id")
      .eq("event_id", event.id)
      .eq("status", "paid");

    if (ordersError) {
      console.error(`[sendEventReminders] orders query error for event ${event.id}:`, ordersError.message);
      continue;
    }

    const partyIds = [...new Set((eventOrders ?? []).map((o) => o.party_id))];

    if (partyIds.length === 0) continue;

    const { data: contactMethods, error: contactError } = await sb
      .from("party_contact_methods")
      .select("value")
      .in("party_id", partyIds)
      .eq("type", "email");

    if (contactError) {
      console.error(`[sendEventReminders] contact methods query error for event ${event.id}:`, contactError.message);
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = new Set<string>();
    for (const cm of contactMethods ?? []) {
      if (cm.value && emailRegex.test(cm.value)) {
        emails.add(cm.value.toLowerCase().trim());
      }
    }

    if (emails.size === 0) continue;

    const eventDate = new Date(event.starts_at);
    const doorsTime = event.doors_at ? new Date(event.doors_at) : null;
    const tz = (meta.timezone as string) || DEFAULT_TIMEZONE;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
    const eventUrl = `${appUrl}/e/${collective.slug}/${event.slug}`;

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
        <p style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</p>

        <h2 style="margin: 16px 0 8px; font-size: 22px;">See you tomorrow night! 🎶</h2>

        <div style="background: #18181B; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <h3 style="margin: 0 0 12px; font-size: 18px; font-weight: 700;">${escapeHtml(event.title)}</h3>
          <p style="color: #A1A1AA; margin: 4px 0;">📅 ${eventDate.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone: tz })}</p>
          ${doorsTime ? `<p style="color: #A1A1AA; margin: 4px 0;">🚪 Doors: ${doorsTime.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz })}</p>` : ""}
          <p style="color: #A1A1AA; margin: 4px 0;">⏰ ${eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: tz })}</p>
          ${event.venue_name ? `<p style="color: #A1A1AA; margin: 4px 0;">📍 ${escapeHtml(event.venue_name)}</p>` : ""}
        </div>

        <p style="color: #A1A1AA; line-height: 1.6; font-size: 15px;">
          Don't forget your QR code — you'll need it at the door. Open your ticket to have it ready.
        </p>

        <a href="${eventUrl}" style="display: inline-block; margin: 16px 0; padding: 14px 28px; background: #7B2FF7; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
          View Your Ticket →
        </a>

        <p style="color: #71717A; font-size: 12px; margin-top: 24px;">
          Hosted by ${escapeHtml(collective.name)} via Nocturn.
          <br/><span style="font-size: 11px;">This is a reminder for an event you have tickets for.</span>
        </p>
      </div>
    `;

    // Send in batches of 10
    const emailList = Array.from(emails);
    for (let i = 0; i < emailList.length; i += 10) {
      const batch = emailList.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((email) =>
          sendEmail({
            to: email,
            subject: `Tomorrow: ${event.title} 🎶`,
            html,
          })
        )
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        console.error(`[reminders] ${failures.length}/${batch.length} emails failed for event ${event.id}`);
      }
      if (i + 10 < emailList.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    totalSent += emails.size;
    eventsProcessed++;

    // Mark reminders as sent
    const { error: updateError } = await sb
      .from("events")
      .update({
        metadata: { ...meta, reminders_sent: true, reminders_sent_at: new Date().toISOString() },
      })
      .eq("id", event.id);

    if (updateError) {
      console.error(`[sendEventReminders] failed to mark reminders sent for event ${event.id}:`, updateError.message);
    }
  }

  return { sent: totalSent, events: eventsProcessed };
  } catch (err) {
    console.error("[sendEventReminders]", err);
    return { sent: 0, events: 0 };
  }
}
