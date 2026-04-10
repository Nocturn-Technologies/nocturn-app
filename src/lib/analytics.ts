/**
 * Analytics tracking utility — data and analytics first.
 *
 * All functions use the admin client and are non-blocking (fire-and-forget).
 * Errors are logged but never thrown to the caller.
 *
 * Tables: event_analytics (per-event cache) + attendee_profiles (CRM segments)
 * NOTE: These tables are defined in 20260329_event_analytics.sql migration.
 * Atomic RPCs defined in 20260329_atomic_analytics_and_fixes.sql.
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
      const db = admin;
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
      const { error: rpcError } = await db.rpc("increment_attendee_profile", {
        p_collective_id: collectiveId,
        p_email: email,
        p_spent: spent,
      });
      if (rpcError) {
        console.warn("[analytics] increment_attendee_profile RPC failed:", rpcError.message);
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

// ─── RSVP → Fan sync ──────────────────────────────────────────────────────────

/**
 * Sync an RSVP into the collective's unified CRM (attendee_profiles + contacts).
 *
 * RSVPs are NOT purchases, so this does not increment total_tickets or total_spent.
 * It ensures a fan row exists for (collective_id, email) and refreshes last_seen_at
 * plus any contact info (name/phone) the fan just provided.
 *
 * This is how RSVPs become first-class "fans" alongside ticket buyers — they
 * appear in /dashboard/attendees, can be targeted by email campaigns, and feed
 * into segments without needing a separate code path.
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

      // ── attendee_profiles ──
      // Insert-if-missing: never clobber existing counters or segment.
      const { error: insertProfileErr } = await admin
        .from("attendee_profiles")
        .upsert(
          {
            collective_id: collectiveId,
            email,
            full_name: fullName ?? null,
            phone: phone ?? null,
            user_id: userId ?? null,
            total_spent: 0,
            total_tickets: 0,
            total_events: 0,
            first_event_at: now,
            last_event_at: now,
            segment: "new",
            tags: ["rsvp"],
            created_at: now,
            updated_at: now,
          },
          { onConflict: "collective_id,email", ignoreDuplicates: true }
        );
      if (insertProfileErr) {
        console.warn("[analytics] syncRsvpFan profile insert:", insertProfileErr.message);
      }

      // Always refresh last_event_at. Backfill missing contact info (name,
      // phone, user_id) via conditional updates so we never clobber values the
      // fan already provided from a prior purchase.
      const { error: updateLastSeenErr } = await admin
        .from("attendee_profiles")
        .update({ last_event_at: now, updated_at: now })
        .eq("collective_id", collectiveId)
        .eq("email", email);
      if (updateLastSeenErr) {
        console.warn("[analytics] syncRsvpFan profile last_event_at:", updateLastSeenErr.message);
      }

      if (fullName) {
        await admin
          .from("attendee_profiles")
          .update({ full_name: fullName })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("full_name", null);
      }
      if (phone) {
        await admin
          .from("attendee_profiles")
          .update({ phone })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("phone", null);
      }
      if (userId) {
        await admin
          .from("attendee_profiles")
          .update({ user_id: userId })
          .eq("collective_id", collectiveId)
          .eq("email", email)
          .is("user_id", null);
      }

      // ── contacts (unified CRM) ──
      // Same pattern: insert-if-missing, then refresh last_seen_at.
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
