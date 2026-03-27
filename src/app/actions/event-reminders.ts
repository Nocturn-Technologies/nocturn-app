"use server";

import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config";

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Send reminder emails to all ticket holders for events happening in the next 24 hours.
 * Designed to be called by a cron job or manual trigger.
 */
export async function sendEventReminders() {
  const sb = admin();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find events starting in the next 24 hours that haven't had reminders sent
  const { data: events } = await sb
    .from("events")
    .select("id, title, slug, starts_at, doors_at, metadata, collectives(name, slug), venues(name, address, city)")
    .in("status", ["published", "upcoming"])
    .gte("starts_at", now.toISOString())
    .lte("starts_at", tomorrow.toISOString());

  if (!events || events.length === 0) {
    return { sent: 0, events: 0 };
  }

  let totalSent = 0;
  let eventsProcessed = 0;

  for (const event of events) {
    const meta = (event.metadata as Record<string, unknown>) || {};

    // Skip if reminders already sent for this event
    if (meta.reminders_sent) continue;

    const collective = event.collectives as unknown as { name: string; slug: string };
    const venue = event.venues as unknown as { name: string; address: string; city: string } | null;

    // Get all ticket holder emails
    const { data: tickets } = await sb
      .from("tickets")
      .select("metadata")
      .eq("event_id", event.id)
      .in("status", ["paid", "checked_in"]);

    const emails = new Set<string>();
    for (const ticket of tickets ?? []) {
      const ticketMeta = ticket.metadata as Record<string, unknown>;
      const email = (ticketMeta?.email as string) || (ticketMeta?.customer_email as string) || (ticketMeta?.buyer_email as string);
      if (email) emails.add(email.toLowerCase().trim());
    }

    if (emails.size === 0) continue;

    const eventDate = new Date(event.starts_at);
    const doorsTime = event.doors_at ? new Date(event.doors_at) : null;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";
    const eventUrl = `${appUrl}/e/${collective?.slug}/${event.slug}`;

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
        <p style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</p>
        
        <h2 style="margin: 16px 0 8px; font-size: 22px;">See you tomorrow night! 🎶</h2>
        
        <div style="background: #18181B; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <h3 style="margin: 0 0 12px; font-size: 18px; font-weight: 700;">${event.title}</h3>
          <p style="color: #A1A1AA; margin: 4px 0;">📅 ${eventDate.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p>
          ${doorsTime ? `<p style="color: #A1A1AA; margin: 4px 0;">🚪 Doors: ${doorsTime.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</p>` : ""}
          <p style="color: #A1A1AA; margin: 4px 0;">⏰ ${eventDate.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</p>
          ${venue ? `<p style="color: #A1A1AA; margin: 4px 0;">📍 ${venue.name}, ${venue.city}</p>` : ""}
        </div>

        <p style="color: #A1A1AA; line-height: 1.6; font-size: 15px;">
          Don't forget your QR code — you'll need it at the door. Open your ticket to have it ready.
        </p>
        
        <a href="${eventUrl}" style="display: inline-block; margin: 16px 0; padding: 14px 28px; background: #7B2FF7; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
          View Your Ticket →
        </a>

        <p style="color: #71717A; font-size: 12px; margin-top: 24px;">
          Hosted by ${collective?.name || "the organizer"} via Nocturn.
          <br/><span style="font-size: 11px;">This is a reminder for an event you have tickets for.</span>
        </p>
      </div>
    `;

    // Send in batches of 10
    const emailList = Array.from(emails);
    for (let i = 0; i < emailList.length; i += 10) {
      const batch = emailList.slice(i, i + 10);
      await Promise.allSettled(
        batch.map((email) =>
          sendEmail({
            to: email,
            subject: `Tomorrow: ${event.title} 🎶`,
            html,
          })
        )
      );
      if (i + 10 < emailList.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    totalSent += emails.size;
    eventsProcessed++;

    // Mark reminders as sent
    await sb
      .from("events")
      .update({
        metadata: { ...meta, reminders_sent: true, reminders_sent_at: new Date().toISOString() },
      })
      .eq("id", event.id);
  }

  return { sent: totalSent, events: eventsProcessed };
}
