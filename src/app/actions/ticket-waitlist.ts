"use server";

import { sendEmail } from "@/lib/email/send";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

/**
 * Join the waitlist for a sold-out ticket tier.
 */
export async function joinWaitlist(eventId: string, tierId: string, waitlistEmail?: string) {
  try {
    if (!eventId?.trim()) return { error: "Event ID is required" };
    if (!tierId?.trim()) return { error: "Tier ID is required" };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Use provided email (for unauthenticated users on public pages) or fall back to auth user email
    const email = waitlistEmail?.trim() || user?.email;
    if (!email) return { error: "Email is required to join the waitlist" };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return { error: "Invalid email format" };

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

    const remaining = (tier.capacity ?? 0) - (soldCount ?? 0);
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

    if (error) return { error: "Something went wrong" };

    return { error: null, message: "You're on the waitlist! We'll email you if a spot opens up." };
  } catch (err) {
    console.error("[joinWaitlist]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Notify waitlisted users when spots open (called after refund).
 * Notifies the next `count` people on the waitlist (oldest first).
 * @param count Number of people to notify (default 1). Pass the refunded ticket quantity.
 */
export async function notifyNextOnWaitlist(eventId: string, tierId: string, count: number = 1) {
  try {
    if (!eventId?.trim()) return { notified: false, notifiedCount: 0 };
    if (!tierId?.trim()) return { notified: false, notifiedCount: 0 };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { notified: false, notifiedCount: 0 };

    const sb = createAdminClient();

    // Verify user owns this event via collective membership
    const { data: eventCheck } = await sb
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!eventCheck) return { notified: false, notifiedCount: 0 };

    const { count: memberCount } = await sb
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", eventCheck.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (!memberCount || memberCount === 0) return { notified: false, notifiedCount: 0 };

    // Clamp count to a reasonable range
    const notifyCount = Math.max(1, Math.min(count, 100));

    // Get the next N people waiting (oldest first)
    const { data: waitlistEntries } = await sb
      .from("ticket_waitlist")
      .select("id, email")
      .eq("event_id", eventId)
      .eq("ticket_tier_id", tierId)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(notifyCount);

    if (!waitlistEntries || waitlistEntries.length === 0) return { notified: false, notifiedCount: 0 };

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

    if (!event) return { notified: false, notifiedCount: 0 };

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

    // Notify each waitlisted person — only mark as notified if email succeeds
    const notifiedEmails: string[] = [];

    for (const entry of waitlistEntries) {
      try {
        await sendEmail({
          to: entry.email,
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
        const { error: updateError } = await sb
          .from("ticket_waitlist")
          .update({ status: "notified", notified_at: new Date().toISOString() })
          .eq("id", entry.id);

        if (updateError) {
          console.error(`[waitlist] Failed to update status for ${entry.email}:`, updateError);
        }

        notifiedEmails.push(entry.email);
      } catch (emailErr) {
        console.error(`[waitlist] Failed to send notification to ${entry.email}:`, emailErr);
      }
    }

    return { notified: notifiedEmails.length > 0, notifiedCount: notifiedEmails.length, emails: notifiedEmails };
  } catch (err) {
    console.error("[notifyNextOnWaitlist]", err);
    return { notified: false, notifiedCount: 0 };
  }
}
