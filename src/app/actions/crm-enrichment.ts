"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

const VIP_EVENT_THRESHOLD = 5;
const VIP_SPEND_THRESHOLD = 500;

export async function enrichAttendeeCRM(eventId: string) {
  try {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!eventId?.trim()) return { error: "Event ID is required" };

  const admin = createAdminClient();

  // Verify ownership
  const { data: ev, error: evError } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (evError) {
    console.error("[enrichAttendeeCRM] event query error:", evError.message);
    return { error: "Failed to load event" };
  }
  if (!ev) return { error: "Event not found" };
  const { count: memberCount, error: memberError } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", ev.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (memberError) {
    console.error("[enrichAttendeeCRM] membership query error:", memberError.message);
    return { error: "Failed to verify membership" };
  }
  if (!memberCount) return { error: "Not authorized" };
    // 1. Get all paid/checked-in tickets for this event
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, user_id, price_paid, metadata")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]);

    if (ticketsError) {
      console.error("[enrichAttendeeCRM] tickets query error:", ticketsError.message);
      return { error: "Failed to load ticket data" };
    }

    if (!tickets || tickets.length === 0) {
      return { error: null, enriched: 0 };
    }

    const now = new Date().toISOString();
    const collectiveId = ev.collective_id;

    // 2. Collect all unique user IDs and emails from tickets
    const userIds: string[] = [];
    const emails: string[] = [];

    for (const ticket of tickets) {
      if (ticket.user_id) userIds.push(ticket.user_id);
      const meta = (ticket.metadata || {}) as Record<string, string>;
      if (meta.customer_email) emails.push(meta.customer_email.toLowerCase());
    }

    // 3. Fetch existing contacts for this collective (by user_id or email)
    let existingContacts: { id: string; user_id: string | null; email: string | null; total_events: number | null; total_spend: number | null; first_seen_at: string | null; vip_status: boolean | null }[] = [];

    if (userIds.length > 0) {
      const { data: byUserId, error: err1 } = await admin
        .from("contacts")
        .select("id, user_id, email, total_events, total_spend, first_seen_at, vip_status")
        .eq("collective_id", collectiveId)
        .in("user_id", userIds);

      if (err1) {
        console.error("[enrichAttendeeCRM] contacts by user_id query error:", err1.message);
        return { error: "Failed to load contacts" };
      }
      if (byUserId) existingContacts = byUserId;
    }

    if (emails.length > 0) {
      const { data: byEmail, error: err2 } = await admin
        .from("contacts")
        .select("id, user_id, email, total_events, total_spend, first_seen_at, vip_status")
        .eq("collective_id", collectiveId)
        .in("email", emails);

      if (err2) {
        console.error("[enrichAttendeeCRM] contacts by email query error:", err2.message);
        return { error: "Failed to load contacts" };
      }
      if (byEmail) {
        const existingIds = new Set(existingContacts.map((c) => c.id));
        for (const c of byEmail) {
          if (!existingIds.has(c.id)) existingContacts.push(c);
        }
      }
    }

    // 4. Index by user_id and email for fast lookup
    const contactByUserId = new Map<string, (typeof existingContacts)[number]>();
    const contactByEmail = new Map<string, (typeof existingContacts)[number]>();

    for (const c of existingContacts ?? []) {
      if (c.user_id) contactByUserId.set(c.user_id, c);
      if (c.email) contactByEmail.set(c.email.toLowerCase(), c);
    }

    // 5. Process all tickets in memory — no DB calls in this loop
    const updatesById = new Map<
      string,
      { user_id: string | null; total_events: number; total_spend: number; last_seen_at: string; vip_status: boolean }
    >();
    const insertsByEmail = new Map<
      string,
      { collective_id: string; contact_type: string; source: string; user_id: string | null; email: string; total_events: number; total_spend: number; first_seen_at: string; last_seen_at: string; vip_status: boolean }
    >();

    for (const ticket of tickets) {
      const userId = ticket.user_id;
      const meta = (ticket.metadata || {}) as Record<string, string>;
      const email = meta.customer_email?.toLowerCase() || null;
      const ticketPrice = Number(ticket.price_paid) || 0;

      // Prefer email-based matching (contacts unique key is (collective_id, email)).
      const existing = (email ? contactByEmail.get(email) : null) ?? (userId ? contactByUserId.get(userId) : null);

      if (existing) {
        const pending = updatesById.get(existing.id);
        if (pending) {
          pending.total_events += 1;
          pending.total_spend = Math.round((pending.total_spend + ticketPrice) * 100) / 100;
          pending.vip_status =
            pending.total_events >= VIP_EVENT_THRESHOLD ||
            pending.total_spend >= VIP_SPEND_THRESHOLD;
        } else {
          const newTotalEvents = (existing.total_events ?? 0) + 1;
          const newTotalSpend =
            Math.round(((Number(existing.total_spend) || 0) + ticketPrice) * 100) / 100;
          const isVip =
            newTotalEvents >= VIP_EVENT_THRESHOLD ||
            newTotalSpend >= VIP_SPEND_THRESHOLD;

          updatesById.set(existing.id, {
            user_id: existing.user_id ?? userId ?? null,
            total_events: newTotalEvents,
            total_spend: newTotalSpend,
            last_seen_at: now,
            vip_status: isVip,
          });
        }
      } else {
        // New contact — key by email (falls back to user_id if anonymous purchase)
        const key = email ?? userId;
        if (!key) continue;

        const pending = insertsByEmail.get(key);
        if (pending) {
          pending.total_events += 1;
          pending.total_spend = Math.round((pending.total_spend + ticketPrice) * 100) / 100;
          pending.vip_status =
            pending.total_events >= VIP_EVENT_THRESHOLD ||
            pending.total_spend >= VIP_SPEND_THRESHOLD;
        } else {
          if (!email) continue; // contacts requires email for the unique key
          const isVip = ticketPrice >= VIP_SPEND_THRESHOLD;
          insertsByEmail.set(key, {
            collective_id: collectiveId,
            contact_type: "fan",
            source: "ticket",
            user_id: userId ?? null,
            email,
            total_events: 1,
            total_spend: Math.round(ticketPrice * 100) / 100,
            first_seen_at: now,
            last_seen_at: now,
            vip_status: isVip,
          });
        }
      }
    }

    // 6. Batch write
    let enrichedCount = 0;

    if (updatesById.size > 0) {
      // contacts requires collective_id NOT NULL, so upsert-by-id isn't type-safe.
      // Issue one UPDATE per row — small N (one per unique attendee per event, post-event pass).
      const updateResults = await Promise.all(
        Array.from(updatesById.entries()).map(([id, data]) =>
          admin.from("contacts").update(data).eq("id", id)
        )
      );
      const updateFail = updateResults.find((r) => r.error);
      if (updateFail?.error) {
        console.error("[enrichAttendeeCRM] batch update failed:", updateFail.error.message);
        return { error: "Failed to update contacts" };
      }
      enrichedCount += updatesById.size;
    }

    if (insertsByEmail.size > 0) {
      const insertRows = Array.from(insertsByEmail.values());

      const { error: insertError } = await admin
        .from("contacts")
        .upsert(insertRows, { onConflict: "collective_id,email" });

      if (insertError) {
        console.error("[enrichAttendeeCRM] batch insert failed:", insertError.message);
        return { error: "Failed to create contacts" };
      } else {
        enrichedCount += insertRows.length;
      }
    }

    return { error: null, enriched: enrichedCount };
  } catch (err) {
    console.error("[enrichAttendeeCRM]", err);
    return { error: "Something went wrong" };
  }
}
