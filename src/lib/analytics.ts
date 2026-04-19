/**
 * Analytics tracking utility — data and analytics first.
 *
 * All functions use the admin client and are non-blocking (fire-and-forget).
 * Errors are logged but never thrown to the caller.
 *
 * Tables: event_analytics (per-event cache) + contacts (unified CRM).
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
      const db = admin;

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
      const db = admin;

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
      const db = admin;

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
      const db = admin;

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

// ─── RSVP → Fan sync ──────────────────────────────────────────────────────────
// Purchase-side CRM writes happen inline in the Stripe webhook (contacts table).

/**
 * Sync an RSVP into the collective's unified CRM (contacts table).
 *
 * RSVPs are NOT purchases, so total_tickets/total_spend are not incremented.
 * Ensures a fan row exists for (collective_id, email) and refreshes last_seen_at
 * plus any contact info (name/phone) the fan just provided.
 *
 * Fire-and-forget: non-blocking, never throws.
 */
export function syncRsvpFan(params: {
  collectiveId: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  userId?: string | null;
  eventId: string;
  eventTitle?: string | null;
}): void {
  const {
    collectiveId,
    email: rawEmail,
    fullName,
    phone,
    userId,
    eventId,
    eventTitle,
  } = params;

  void (async () => {
    try {
      if (!collectiveId || !rawEmail) return;
      const email = rawEmail.toLowerCase().trim();
      if (!email) return;

      const admin = createAdminClient();
      const now = new Date().toISOString();

      // ── contacts (unified CRM) ──
      // Insert-if-missing, then refresh last_seen_at.
      const { error: insertContactErr } = await admin
        .from("contacts")
        .upsert(
          {
            collective_id: collectiveId,
            contact_type: "fan",
            email,
            full_name: fullName ?? null,
            phone: phone ?? null,
            user_id: userId ?? null,
            source: "rsvp",
            source_detail: eventTitle ?? eventId,
            total_events: 0,
            total_spend: 0,
            first_seen_at: now,
            last_seen_at: now,
            tags: ["rsvp"],
            metadata: { rsvp_event_id: eventId },
          },
          { onConflict: "collective_id,email", ignoreDuplicates: true }
        );
      if (insertContactErr) {
        console.warn("[analytics] syncRsvpFan contact insert:", insertContactErr.message);
      }

      const { error: updateContactErr } = await admin
        .from("contacts")
        .update({ last_seen_at: now, updated_at: now })
        .eq("collective_id", collectiveId)
        .eq("email", email);
      if (updateContactErr) {
        console.warn("[analytics] syncRsvpFan contact last_seen_at:", updateContactErr.message);
      }

      if (fullName) {
        await admin
          .from("contacts")
          .update({ full_name: fullName })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("full_name", null);
      }
      if (phone) {
        await admin
          .from("contacts")
          .update({ phone })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("phone", null);
      }
      if (userId) {
        await admin
          .from("contacts")
          .update({ user_id: userId })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("user_id", null);
      }
    } catch (err) {
      console.error("[analytics] syncRsvpFan failed:", err);
    }
  })();
}
