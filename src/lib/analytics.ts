/**
 * Analytics tracking utility — data and analytics first.
 *
 * All functions use the admin client and are non-blocking (fire-and-forget).
 * Errors are logged but never thrown to the caller.
 *
 * Tables: event_analytics (per-event cache) + attendee_profiles (CRM segments)
 * NOTE: These tables are defined in 20260329_event_analytics.sql migration.
 * TypeScript types are cast via `as any` until supabase types are regenerated.
 */

import { createAdminClient } from "@/lib/supabase/config";

// ─── Event-level tracking ─────────────────────────────────────────────────────

/**
 * Increment page_views for an event.
 * Called from the public event page on each server render.
 */
export function trackEventPageView(eventId: string): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;

      // Ensure row exists (ignore duplicate)
      await db
        .from("event_analytics")
        .upsert(
          { event_id: eventId, updated_at: new Date().toISOString() },
          { onConflict: "event_id", ignoreDuplicates: true }
        );

      // Fetch current count and increment
      const { data: existing } = await db
        .from("event_analytics")
        .select("page_views")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existing) {
        await db
          .from("event_analytics")
          .update({
            page_views: ((existing.page_views as number) ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("event_id", eventId);
      }
    } catch (err) {
      console.error("[analytics] trackEventPageView failed:", err);
    }
  })();
}

/**
 * Increment checkout_starts for an event.
 * Called when a user opens the checkout modal/flow.
 */
export function trackCheckoutStart(eventId: string): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;

      // Ensure row exists first
      await db
        .from("event_analytics")
        .upsert(
          { event_id: eventId, updated_at: new Date().toISOString() },
          { onConflict: "event_id", ignoreDuplicates: true }
        );

      const { data: existing } = await db
        .from("event_analytics")
        .select("checkout_starts")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existing) {
        await db
          .from("event_analytics")
          .update({
            checkout_starts: ((existing.checkout_starts as number) ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("event_id", eventId);
      }
    } catch (err) {
      console.error("[analytics] trackCheckoutStart failed:", err);
    }
  })();
}

/**
 * Track a ticket sale: update tickets_sold, gross_revenue, and recalculate
 * conversion_rate and capacity_percentage from live ticket/tier data.
 */
export function trackTicketSold(
  eventId: string,
  quantity: number,
  revenue: number
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;

      // Ensure row exists
      await db
        .from("event_analytics")
        .upsert(
          { event_id: eventId, updated_at: new Date().toISOString() },
          { onConflict: "event_id", ignoreDuplicates: true }
        );

      const { data: existing } = await db
        .from("event_analytics")
        .select("tickets_sold, gross_revenue, net_revenue, checkout_starts, checkout_completions")
        .eq("event_id", eventId)
        .maybeSingle();

      if (!existing) return;

      const newTicketsSold = ((existing.tickets_sold as number) ?? 0) + quantity;
      const newGrossRevenue = Number(existing.gross_revenue ?? 0) + revenue;
      const newCheckoutCompletions = ((existing.checkout_completions as number) ?? 0) + 1;
      const avgTicketPrice = newTicketsSold > 0 ? newGrossRevenue / newTicketsSold : 0;

      // Nocturn fee: 7% + $0.50 per ticket
      const nocturnFee = revenue * 0.07 + quantity * 0.5;
      const newNetRevenue = Number(existing.net_revenue ?? 0) + (revenue - nocturnFee);

      // Pull current tier capacity for ratio calculations
      const { data: tierData } = await admin
        .from("ticket_tiers")
        .select("capacity")
        .eq("event_id", eventId);

      const totalCapacity = (tierData ?? []).reduce(
        (s: number, t: { capacity: number | null }) => s + (t.capacity ?? 0),
        0
      );

      const conversionRate =
        ((existing.checkout_starts as number) ?? 0) > 0
          ? Math.min(100, (newCheckoutCompletions / ((existing.checkout_starts as number) ?? 1)) * 100)
          : 0;

      const capacityPercentage =
        totalCapacity > 0 ? Math.min(100, (newTicketsSold / totalCapacity) * 100) : 0;

      await db
        .from("event_analytics")
        .update({
          tickets_sold: newTicketsSold,
          gross_revenue: newGrossRevenue,
          net_revenue: Math.max(0, newNetRevenue),
          avg_ticket_price: avgTicketPrice,
          checkout_completions: newCheckoutCompletions,
          conversion_rate: Math.round(conversionRate * 100) / 100,
          capacity_percentage: Math.round(capacityPercentage * 100) / 100,
          updated_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
    } catch (err) {
      console.error("[analytics] trackTicketSold failed:", err);
    }
  })();
}

/**
 * Track a ticket refund: increment tickets_refunded, subtract from gross/net revenue.
 */
export function trackTicketRefunded(
  eventId: string,
  quantity: number,
  amount: number
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;

      // Ensure row exists
      await db
        .from("event_analytics")
        .upsert(
          { event_id: eventId, updated_at: new Date().toISOString() },
          { onConflict: "event_id", ignoreDuplicates: true }
        );

      const { data: existing } = await db
        .from("event_analytics")
        .select("tickets_refunded, gross_revenue, net_revenue, tickets_sold")
        .eq("event_id", eventId)
        .maybeSingle();

      if (!existing) return;

      const newTicketsRefunded = ((existing.tickets_refunded as number) ?? 0) + quantity;
      const newGrossRevenue = Math.max(0, Number(existing.gross_revenue ?? 0) - amount);
      const nocturnFee = amount * 0.07 + quantity * 0.5;
      const newNetRevenue = Math.max(0, Number(existing.net_revenue ?? 0) - (amount - nocturnFee));
      const netTicketsSold = Math.max(0, ((existing.tickets_sold as number) ?? 0) - quantity);
      const avgTicketPrice = netTicketsSold > 0 ? newGrossRevenue / netTicketsSold : 0;

      await db
        .from("event_analytics")
        .update({
          tickets_refunded: newTicketsRefunded,
          gross_revenue: newGrossRevenue,
          net_revenue: newNetRevenue,
          avg_ticket_price: avgTicketPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
    } catch (err) {
      console.error("[analytics] trackTicketRefunded failed:", err);
    }
  })();
}

/**
 * Full recalculation of event_analytics from source-of-truth tickets table.
 * Use for corrections or after bulk operations.
 */
export async function refreshEventAnalytics(eventId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const [{ data: soldTickets }, { data: refundedTickets }, { data: tierData }] =
      await Promise.all([
        admin
          .from("tickets")
          .select("price_paid")
          .eq("event_id", eventId)
          .in("status", ["paid", "checked_in"]),
        admin
          .from("tickets")
          .select("price_paid")
          .eq("event_id", eventId)
          .eq("status", "refunded"),
        admin.from("ticket_tiers").select("capacity").eq("event_id", eventId),
      ]);

    const ticketsSold = (soldTickets ?? []).length;
    const ticketsRefunded = (refundedTickets ?? []).length;
    const grossRevenue = (soldTickets ?? []).reduce(
      (s: number, t: { price_paid: number | null }) => s + Number(t.price_paid ?? 0),
      0
    );
    const avgTicketPrice = ticketsSold > 0 ? grossRevenue / ticketsSold : 0;
    const nocturnFee = grossRevenue * 0.07 + ticketsSold * 0.5;
    const netRevenue = Math.max(0, grossRevenue - nocturnFee);
    const totalCapacity = (tierData ?? []).reduce(
      (s: number, t: { capacity: number | null }) => s + (t.capacity ?? 0),
      0
    );
    const capacityPercentage =
      totalCapacity > 0 ? Math.min(100, (ticketsSold / totalCapacity) * 100) : 0;

    await db
      .from("event_analytics")
      .upsert(
        {
          event_id: eventId,
          tickets_sold: ticketsSold,
          tickets_refunded: ticketsRefunded,
          gross_revenue: grossRevenue,
          net_revenue: netRevenue,
          avg_ticket_price: avgTicketPrice,
          capacity_percentage: Math.round(capacityPercentage * 100) / 100,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id" }
      );
  } catch (err) {
    console.error("[analytics] refreshEventAnalytics failed:", err);
  }
}

// ─── Attendee CRM ─────────────────────────────────────────────────────────────

/**
 * Create or update an attendee profile.
 * Recalculates segment based on purchase history:
 *   vip    — spent >= $200 or attended >= 5 events
 *   repeat — attended >= 2 events
 *   new    — first purchase
 *   lapsed — no purchase in 180+ days (set separately)
 */
export function upsertAttendeeProfile(
  collectiveId: string,
  email: string,
  _eventId: string,
  spent: number
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;
      const now = new Date().toISOString();

      // Fetch existing profile if any
      const { data: existing } = await db
        .from("attendee_profiles")
        .select("id, total_spent, total_tickets, total_events")
        .eq("collective_id", collectiveId)
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        const newTotalSpent = Number(existing.total_spent ?? 0) + spent;
        const newTotalTickets = (Number(existing.total_tickets) || 0) + 1;
        const newTotalEvents = (Number(existing.total_events) || 0) + 1;
        const segment = deriveSegment(newTotalSpent, newTotalEvents);

        await db
          .from("attendee_profiles")
          .update({
            total_spent: newTotalSpent,
            total_tickets: newTotalTickets,
            total_events: newTotalEvents,
            last_purchase_at: now,
            segment,
            updated_at: now,
          })
          .eq("id", existing.id);
      } else {
        const segment = deriveSegment(spent, 1);

        await db.from("attendee_profiles").insert({
          collective_id: collectiveId,
          email,
          total_spent: spent,
          total_tickets: 1,
          total_events: 1,
          first_purchase_at: now,
          last_purchase_at: now,
          segment,
          created_at: now,
          updated_at: now,
        });
      }
    } catch (err) {
      console.error("[analytics] upsertAttendeeProfile failed:", err);
    }
  })();
}

function deriveSegment(totalSpent: number, totalEvents: number): string {
  if (totalSpent >= 200 || totalEvents >= 5) return "vip";
  if (totalEvents >= 2) return "repeat";
  return "new";
}
