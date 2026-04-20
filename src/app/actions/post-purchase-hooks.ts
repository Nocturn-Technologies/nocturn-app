// Internal webhook utility — NOT a server action (only called by Stripe webhook)
import { sendEmail } from "@/lib/email/send";
import { referralNudgeEmail, ticketMilestoneEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/config";
import { escapeHtml } from "@/lib/html";

/** Sanitize buyer name for safe use in HTML emails */
function sanitizeBuyerName(name: string | undefined): string {
  if (!name) return "there";
  // Strip control chars, limit length, then HTML-escape
  const cleaned = name.replace(/[\r\n\x00-\x1f]/g, "").trim().slice(0, 100);
  return escapeHtml(cleaned) || "there";
}

/**
 * Run after every ticket purchase. Non-blocking — call with .catch(() => {}).
 * Handles: referral nudge, ticket milestone notifications.
 */
export async function runPostPurchaseHooks(input: {
  eventId: string;
  buyerEmail: string;
  buyerName?: string;
  ticketToken: string;
}) {
  try {
  // Input validation
  if (!input.eventId || typeof input.eventId !== "string" || input.eventId.length > 100) {
    console.error("[post-purchase] Invalid eventId");
    return;
  }
  if (!input.buyerEmail || typeof input.buyerEmail !== "string" || input.buyerEmail.length > 320) {
    console.error("[post-purchase] Invalid buyerEmail");
    return;
  }
  if (!input.ticketToken || typeof input.ticketToken !== "string" || input.ticketToken.length > 500) {
    console.error("[post-purchase] Invalid ticketToken");
    return;
  }

  const sb = createAdminClient();
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  // Get event + collective info
  const { data: event, error: eventError } = await sb
    .from("events")
    .select("title, slug, collective_id, collectives(name, slug)")
    .eq("id", input.eventId)
    .maybeSingle();

  if (eventError) {
    console.error("[post-purchase] Failed to fetch event:", eventError);
    return;
  }
  if (!event) return;

  const collective = event.collectives as unknown as { name: string; slug: string } | null;

  // ── 1. Referral Nudge (send 1 min after purchase — instant for now) ──
  try {
    const referralLink = `${BASE_URL}/e/${collective?.slug ?? ""}/${event.slug}?ref=${input.ticketToken}`;

    const safeName = sanitizeBuyerName(input.buyerName?.split(" ")[0]);

    const html = referralNudgeEmail(
      event.title,
      safeName,
      referralLink,
      collective?.name ?? "the collective"
    );

    await sendEmail({
      to: input.buyerEmail,
      subject: `Share ${event.title.replace(/[\r\n\x00-\x1f]/g, "")} with your crew`,
      html,
    });
  } catch (e) {
    console.error("[post-purchase] referral nudge failed:", e);
  }

  // ── 2. Ticket Milestone Check ──
  try {
    // Get current sold count + capacity
    const [{ count: totalSold }, { data: tiers }] = await Promise.all([
      sb.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", input.eventId).in("status", ["valid", "checked_in"]),
      sb.from("ticket_tiers").select("capacity").eq("event_id", input.eventId),
    ]);

    const totalCapacity = (tiers ?? []).reduce((s, t) => s + (t.capacity || 0), 0);
    const sold = totalSold ?? 0;

    if (totalCapacity === 0) return;

    const percent = Math.round((sold / totalCapacity) * 100);

    // Check milestones: 25%, 50%, 75%, 100%
    const milestones = [
      { threshold: 25, label: "25% sold!" },
      { threshold: 50, label: "Halfway there — 50% sold!" },
      { threshold: 75, label: "75% sold — almost there!" },
      { threshold: 100, label: "SOLD OUT!" },
    ];

    for (const m of milestones) {
      if (percent < m.threshold) continue;

      // Check if this milestone was already sent
      const { count } = await sb
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("record_id", input.eventId)
        .eq("action", `milestone_${m.threshold}_sent`);

      if ((count ?? 0) > 0) continue;

      // Check if we just crossed this threshold (were below before this purchase)
      const prevPercent = Math.round(((sold - 1) / totalCapacity) * 100);
      if (prevPercent >= m.threshold) continue; // Already past this milestone before

      // Send milestone email to organizer
      if (!event) return; // event may have been deleted between hooks

      const { data: admins } = await sb
        .from("collective_members")
        .select("users(email)")
        .eq("collective_id", event.collective_id)
        .eq("role", "admin")
        .is("deleted_at", null);

      const dashLink = `${BASE_URL}/dashboard/events/${input.eventId}`;

      const safeTitle = event.title.replace(/[\r\n\x00-\x1f]/g, "");
      await Promise.all(
        (admins ?? []).map(async (a) => {
          const user = a.users as unknown as { email: string } | null;
          if (!user?.email) return;
          const html = ticketMilestoneEmail(event.title, m.label, sold, totalCapacity, dashLink);
          await sendEmail({
            to: user.email,
            subject: `${safeTitle} — ${m.label} 🎉`,
            html,
          });
        })
      );

      // Mark milestone as sent
      await sb.from("audit_logs").insert({
        table_name: "events",
        record_id: input.eventId,
        action: `milestone_${m.threshold}_sent`,
        new_data: { sold, totalCapacity, percent },
      });

      break; // Only send one milestone per purchase
    }
  } catch (e) {
    console.error("[post-purchase] milestone check failed:", e);
  }
  } catch (err) {
    console.error("[post-purchase] runPostPurchaseHooks failed:", err);
  }
}
