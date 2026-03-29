"use server";

import { sendEmail } from "@/lib/email/send";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * Join the waitlist for a sold-out ticket tier.
 */
export async function joinWaitlist(eventId: string, tierId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const email = user.email;
  if (!email) return { error: "No email associated with your account" };

  const sb = createAdminClient();

  // Verify tier is actually sold out
  const { data: tier } = await sb
    .from("ticket_tiers")
    .select("id, name, capacity")
    .eq("id", tierId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!tier) return { error: "Ticket tier not found" };

  const { count: soldCount } = await sb
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("ticket_tier_id", tierId)
    .in("status", ["paid", "checked_in"]);

  const remaining = tier.capacity - (soldCount ?? 0);
  if (remaining > 0) {
    return { error: "This tier still has tickets available — no need to waitlist!" };
  }

  // Add to waitlist (upsert to handle duplicates gracefully)
  const { error } = await sb
    .from("ticket_waitlist")
    .upsert(
      { event_id: eventId, ticket_tier_id: tierId, email: email.toLowerCase().trim(), status: "waiting" },
      { onConflict: "event_id,ticket_tier_id,email" }
    );

  if (error) return { error: error.message };

  return { error: null, message: "You're on the waitlist! We'll email you if a spot opens up." };
}

/**
 * Get waitlist count for a tier.
 */
export async function getWaitlistCount(tierId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const sb = createAdminClient();
  const { count } = await sb
    .from("ticket_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("ticket_tier_id", tierId)
    .eq("status", "waiting");

  return count ?? 0;
}

/**
 * Notify waitlisted users when a spot opens (called after refund).
 * Notifies the first person on the waitlist.
 */
export async function notifyNextOnWaitlist(eventId: string, tierId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notified: false };

  const sb = createAdminClient();

  // Verify user owns this event via collective membership
  const { data: eventCheck } = await sb
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!eventCheck) return { notified: false };

  const { count: memberCount } = await sb
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", eventCheck.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (!memberCount || memberCount === 0) return { notified: false };

  // Get the next person waiting
  const { data: next } = await sb
    .from("ticket_waitlist")
    .select("id, email")
    .eq("event_id", eventId)
    .eq("ticket_tier_id", tierId)
    .eq("status", "waiting")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return { notified: false };

  // Get event + tier details for the email
  const { data: event } = await sb
    .from("events")
    .select("title, slug, collectives(slug)")
    .eq("id", eventId)
    .maybeSingle();

  const { data: tier } = await sb
    .from("ticket_tiers")
    .select("name")
    .eq("id", tierId)
    .maybeSingle();

  if (!event) return { notified: false };

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const collective = event.collectives as unknown as { slug: string } | null;
  const eventUrl = collective?.slug
    ? `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${collective.slug}/${event.slug}`
    : `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/dashboard/events/${eventId}`;

  // Send notification email — only mark as notified if email succeeds
  try {
    await sendEmail({
      to: next.email,
      subject: `A spot just opened up — ${event.title} 🎟️`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090B; color: #FAFAFA;">
          <p style="color: #7B2FF7; font-size: 14px; font-weight: 600;">🌙 nocturn.</p>
          <h2 style="margin: 16px 0 8px;">Good news — a spot just opened!</h2>
          <p style="color: #A1A1AA; line-height: 1.6;">
            A <strong style="color: #FAFAFA;">${escapeHtml(tier?.name || "ticket")}</strong> just became available for
            <strong style="color: #FAFAFA;">${escapeHtml(event.title)}</strong>.
            You were next on the waitlist — grab it before it's gone!
          </p>
          <a href="${eventUrl}" style="display: inline-block; margin: 20px 0; padding: 14px 28px; background: #7B2FF7; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
            Get Your Ticket →
          </a>
          <p style="color: #71717A; font-size: 12px; margin-top: 24px;">
            This spot is first-come, first-served. If it sells out again, you'll stay on the waitlist.
            <br/><span style="font-size: 11px;">Don't want these emails? Reply with "unsubscribe" to opt out.</span>
          </p>
        </div>
      `,
    });

    // Only mark as notified after email successfully sent
    await sb
      .from("ticket_waitlist")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .eq("id", next.id);

    return { notified: true, email: next.email };
  } catch (emailErr) {
    console.error("[waitlist] Failed to send notification email:", emailErr);
    return { notified: false };
  }
}
