"use server";

import { sendEmail } from "@/lib/email/send";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { redactEmail } from "@/lib/log-redaction";

/**
 * Join the waitlist for a sold-out ticket tier.
 * Uses the ticket_waitlist table: id, tier_id, email, name, party_id, notified_at, created_at
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

    // Verify tier belongs to this event and check capacity
    const { data: tier } = await sb
      .from("ticket_tiers")
      .select("id, name, capacity")
      .eq("id", tierId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (!tier) return { error: "Ticket tier not found" };

    // Count sold tickets for this tier
    const { count: soldCount } = await sb
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("tier_id", tierId)
      .in("status", ["paid", "checked_in"]);

    const remaining = (tier.capacity ?? 0) - (soldCount ?? 0);
    if (remaining > 0) {
      return { error: "This tier still has tickets available — no need to waitlist!" };
    }

    // Resolve party_id from auth user if available
    let partyId: string | null = null;
    if (user) {
      const { data: userRow } = await sb
        .from("users")
        .select("party_id")
        .eq("id", user.id)
        .maybeSingle();
      partyId = userRow?.party_id ?? null;
    }

    // Add to ticket_waitlist — upsert to handle duplicates gracefully
    // Unique constraint expected on (tier_id, email)
    const { error } = await sb
      .from("ticket_waitlist")
      .upsert(
        {
          tier_id: tierId,
          email: email.toLowerCase().trim(),
          party_id: partyId,
          notified_at: null,
        },
        { onConflict: "tier_id,email" }
      );

    if (error) {
      console.error("[joinWaitlist] upsert error:", error);
      return { error: "Something went wrong" };
    }

    return { error: null, message: "You're on the waitlist! We'll email you if a spot opens up." };
  } catch (err) {
    console.error("[joinWaitlist]", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Notify waitlisted users when spots open (called after refund).
 * Notifies the next `count` people on the waitlist (oldest first, un-notified only).
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

    // Get the next N people waiting (oldest first, not yet notified)
    const { data: waitlistEntries } = await sb
      .from("ticket_waitlist")
      .select("id, email, name")
      .eq("tier_id", tierId)
      .is("notified_at", null)
      .order("created_at", { ascending: true })
      .limit(notifyCount);

    if (!waitlistEntries || waitlistEntries.length === 0) return { notified: false, notifiedCount: 0 };

    // Get event + tier details for the email
    const [{ data: event }, { data: tier }] = await Promise.all([
      sb.from("events").select("title, slug, collectives(slug)").eq("id", eventId).maybeSingle(),
      sb.from("ticket_tiers").select("name").eq("id", tierId).maybeSingle(),
    ]);

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
    const eventUrl = collective?.slug && event.slug
      ? `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/e/${collective.slug}/${event.slug}`
      : `${process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com"}/dashboard/events/${eventId}`;

    // Notify each waitlisted person — only mark as notified if email succeeds
    const notifiedEmails: string[] = [];

    for (const entry of waitlistEntries as Array<{ id: string; email: string; name: string | null }>) {
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

        // Mark as notified only after email succeeds
        const { error: updateError } = await sb
          .from("ticket_waitlist")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", entry.id);

        if (updateError) {
          console.error(`[waitlist] Failed to update notified_at for ${redactEmail(entry.email)}:`, updateError);
        }

        notifiedEmails.push(entry.email);
      } catch (emailErr) {
        console.error(`[waitlist] Failed to send notification to ${redactEmail(entry.email)}:`, emailErr);
      }
    }

    return { notified: notifiedEmails.length > 0, notifiedCount: notifiedEmails.length, emails: notifiedEmails };
  } catch (err) {
    console.error("[notifyNextOnWaitlist]", err);
    return { notified: false, notifiedCount: 0 };
  }
}
