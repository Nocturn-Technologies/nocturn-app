// Internal webhook utility — NOT a server action (only called by Stripe webhook)
import { sendEmail } from "@/lib/email/send";
import { referralNudgeEmail, ticketMilestoneEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/config";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const sb = createAdminClient();
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.trynocturn.com";

  // Get event + collective info
  const { data: event } = await sb
    .from("events")
    .select("title, slug, collective_id, collectives(name, slug)")
    .eq("id", input.eventId)
    .maybeSingle();

  if (!event) return;

  const collective = event.collectives as unknown as { name: string; slug: string } | null;

  // ── 1. Referral Nudge (send 1 min after purchase — instant for now) ──
  try {
    const referralLink = `${BASE_URL}/e/${collective?.slug ?? ""}/${event.slug}?ref=${input.ticketToken.slice(0, 8)}`;

    const html = referralNudgeEmail(
      event.title,
      input.buyerName?.split(" ")[0] ?? "there",
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
      sb.from("tickets").select("*", { count: "exact", head: true }).eq("event_id", input.eventId).in("status", ["paid", "checked_in"]),
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
        .eq("event_id", input.eventId)
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

      for (const a of admins ?? []) {
        const user = a.users as unknown as { email: string } | null;
        if (!user?.email) continue;

        const html = ticketMilestoneEmail(event.title, m.label, sold, totalCapacity, dashLink);
        await sendEmail({
          to: user.email,
          subject: `${event.title.replace(/[\r\n\x00-\x1f]/g, "")} — ${m.label} 🎉`,
          html,
        });
      }

      // Mark milestone as sent
      await sb.from("audit_logs").insert({
        event_id: input.eventId,
        action: `milestone_${m.threshold}_sent`,
        metadata: { sold, totalCapacity, percent },
      });

      break; // Only send one milestone per purchase
    }
  } catch (e) {
    console.error("[post-purchase] milestone check failed:", e);
  }
}
