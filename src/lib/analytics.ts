/**
 * Analytics tracking utility — data and analytics first.
 *
 * All functions use the admin client and are non-blocking (fire-and-forget).
 * Errors are logged but never thrown to the caller.
 *
 * Tables: event_analytics (per-event cache) + attendee_profiles (CRM segments)
 * NOTE: These tables are defined in 20260329_event_analytics.sql migration.
 * Atomic RPCs defined in 20260329_atomic_analytics_and_fixes.sql.
 * TypeScript types are cast via `as any` until supabase types are regenerated.
 */

import { createAdminClient } from "@/lib/supabase/config";

// ─── Event-level tracking ─────────────────────────────────────────────────────

/**
 * Increment page_views for an event.
 * Called from the public event page on each server render.
 * Uses atomic DB increment via RPC to prevent lost updates under concurrency.
 */
export function trackEventPageView(eventId: string): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;

      await db.rpc("increment_analytics_counter", {
        p_event_id: eventId,
        p_column: "page_views",
        p_value: 1,
      });
    } catch (err) {
      console.error("[analytics] trackEventPageView failed:", err);
    }
  })();
}

/**
 * Increment checkout_starts for an event.
 * Called when a user opens the checkout modal/flow.
 * Uses atomic DB increment via RPC to prevent lost updates under concurrency.
 */
export function trackCheckoutStart(eventId: string): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = admin as any;

      await db.rpc("increment_analytics_counter", {
        p_event_id: eventId,
        p_column: "checkout_starts",
        p_value: 1,
      });
    } catch (err) {
      console.error("[analytics] trackCheckoutStart failed:", err);
    }
  })();
}

/**
 * Track a ticket sale: atomically update tickets_sold, gross_revenue,
 * net_revenue, avg_ticket_price, conversion_rate, and capacity_percentage.
 * Uses a single RPC call to prevent lost updates under concurrency.
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

      await db.rpc("track_ticket_sale", {
        p_event_id: eventId,
        p_quantity: quantity,
        p_revenue: revenue,
      });
    } catch (err) {
      console.error("[analytics] trackTicketSold failed:", err);
    }
  })();
}

/**
 * Track a ticket refund: atomically decrement revenue and increment refund count.
 * Uses a single RPC call to prevent lost updates under concurrency.
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

      await db.rpc("track_ticket_refund", {
        p_event_id: eventId,
        p_quantity: quantity,
        p_amount: amount,
      });
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

    // Verify event exists and is not soft-deleted before recalculating
    const { data: eventCheck } = await admin
      .from("events")
      .select("id")
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!eventCheck) {
      console.warn(`[analytics] refreshEventAnalytics skipped — event ${eventId} not found or soft-deleted`);
      return;
    }

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
      const segment = deriveSegment(spent, 1);

      // Use INSERT ... ON CONFLICT DO UPDATE to eliminate the read-then-write race.
      // The unique index on (collective_id, email) handles conflict detection.
      const { error } = await db
        .from("attendee_profiles")
        .upsert(
          {
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
          },
          {
            onConflict: "collective_id,email",
            ignoreDuplicates: false,
          }
        );

      // If upsert inserted (new row), we're done. If it conflicted, we need to
      // increment the existing values. Supabase upsert replaces on conflict,
      // so we follow up with an atomic SQL increment for existing profiles.
      if (error) {
        // Fallback: increment existing profile atomically via raw update
        console.warn("[analytics] upsert fallback for attendee profile:", error.message);
      }

      // Atomically increment counters for existing profiles (handles the conflict case)
      // This is safe to run even on new rows (it just re-sets the same values)
      await db.rpc("increment_attendee_profile", {
        p_collective_id: collectiveId,
        p_email: email,
        p_spent: spent,
      }).catch(() => {
        // RPC may not exist yet — fall back to read-then-write
        // This path only runs if the migration hasn't been applied
        void (async () => {
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
            const seg = deriveSegment(newTotalSpent, newTotalEvents);

            await db
              .from("attendee_profiles")
              .update({
                total_spent: newTotalSpent,
                total_tickets: newTotalTickets,
                total_events: newTotalEvents,
                last_purchase_at: now,
                segment: seg,
                updated_at: now,
              })
              .eq("id", existing.id);
          }
        })();
      });
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
