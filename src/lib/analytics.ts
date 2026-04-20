/**
 * Analytics tracking utility — data and analytics first.
 *
 * All functions use the admin client and are non-blocking (fire-and-forget).
 * Errors are logged but never thrown to the caller.
 *
 * Tables: event_analytics (per-event cache) + attendee_profiles (unified CRM).
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
        p_field: "page_views",
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
        p_field: "checkout_starts",
        p_value: 1,
      });
    } catch (err) {
      console.error("[analytics] trackCheckoutStart failed:", err);
    }
  })();
}

/**
 * Track a ticket sale: atomically update tickets_sold and related tier-level stats.
 * Uses a single RPC call to prevent lost updates under concurrency.
 */
export function trackTicketSold(
  tierId: string,
  quantity: number
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const db = admin;

      await db.rpc("track_ticket_sale", {
        p_tier_id: tierId,
        p_quantity: quantity,
      });
    } catch (err) {
      console.error("[analytics] trackTicketSold failed:", err);
    }
  })();
}

/**
 * Track a ticket refund: atomically decrement ticket count at the tier level.
 * Uses a single RPC call to prevent lost updates under concurrency.
 */
export function trackTicketRefunded(
  tierId: string,
  quantity: number
): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      const db = admin;

      await db.rpc("track_ticket_refund", {
        p_tier_id: tierId,
        p_quantity: quantity,
      });
    } catch (err) {
      console.error("[analytics] trackTicketRefunded failed:", err);
    }
  })();
}

// ─── RSVP → Fan sync ──────────────────────────────────────────────────────────
// Purchase-side CRM writes happen inline in the Stripe webhook (attendee_profiles table).

/**
 * Sync an RSVP into the collective's unified CRM (attendee_profiles table).
 *
 * RSVPs are NOT purchases, so total_tickets/total_spend are not incremented.
 * Ensures a fan row exists for (collective_id, email) and refreshes last_seen_at
 * plus any contact info (name) the fan just provided.
 *
 * Fire-and-forget: non-blocking, never throws.
 */
export function syncRsvpFan(params: {
  collectiveId: string;
  email: string;
  fullName?: string | null;
  userId?: string | null;
  eventId: string;
  eventTitle?: string | null;
}): void {
  const {
    collectiveId,
    email: rawEmail,
    fullName,
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

      // ── attendee_profiles (unified CRM) ──
      // Insert-if-missing via unique index on (collective_id, email), then refresh last_seen_at.
      const { error: upsertErr } = await admin
        .from("attendee_profiles")
        .upsert(
          {
            collective_id: collectiveId,
            email,
            full_name: fullName ?? null,
            user_id: userId ?? null,
            total_events: 0,
            total_tickets: 0,
            total_spend: 0,
            first_seen_at: now,
            last_seen_at: now,
            metadata: { rsvp_event_id: eventId, event_title: eventTitle ?? null },
          },
          { onConflict: "collective_id,email", ignoreDuplicates: true }
        );
      if (upsertErr) {
        console.warn("[analytics] syncRsvpFan upsert:", upsertErr.message);
      }

      const { error: updateErr } = await admin
        .from("attendee_profiles")
        .update({ last_seen_at: now, updated_at: now })
        .eq("collective_id", collectiveId)
        .eq("email", email);
      if (updateErr) {
        console.warn("[analytics] syncRsvpFan last_seen_at:", updateErr.message);
      }

      if (fullName) {
        await admin
          .from("attendee_profiles")
          .update({ full_name: fullName })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("full_name", null);
      }
      if (userId) {
        await admin
          .from("attendee_profiles")
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
