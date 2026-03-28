"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";

const VIP_EVENT_THRESHOLD = 5;
const VIP_SPEND_THRESHOLD = 500;

export async function enrichAttendeeCRM(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  try {
    // 1. Get all paid/checked-in tickets for this event
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, user_id, price_paid, metadata")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]);

    if (ticketsError) {
      return { error: `Tickets query failed: ${ticketsError.message}` };
    }

    if (!tickets || tickets.length === 0) {
      return { error: null, enriched: 0 };
    }

    const now = new Date().toISOString();

    // 2. Collect all unique user IDs and emails from tickets
    const userIds: string[] = [];
    const emails: string[] = [];

    for (const ticket of tickets) {
      if (ticket.user_id) userIds.push(ticket.user_id);
      const meta = (ticket.metadata || {}) as Record<string, string>;
      if (meta.customer_email) emails.push(meta.customer_email);
    }

    // 3. Fetch ALL existing attendee profiles in ONE query (using parameterized .in())
    let profileQuery = admin
      .from("attendee_profiles")
      .select("id, user_id, email, total_events, total_spend, first_event_at, vip_status");

    // Use Supabase SDK's parameterized .in() to avoid PostgREST filter injection
    if (userIds.length > 0 && emails.length > 0) {
      profileQuery = profileQuery.or(`user_id.in.(${userIds.map(id => id.replace(/[(),]/g, "")).join(",")}),email.in.(${emails.map(e => e.replace(/[(),]/g, "")).join(",")})`);
    } else if (userIds.length > 0) {
      profileQuery = profileQuery.in("user_id", userIds);
    } else if (emails.length > 0) {
      profileQuery = profileQuery.in("email", emails);
    }

    const { data: existingProfiles, error: profilesError } = await profileQuery;

    if (profilesError) {
      return { error: `Profiles query failed: ${profilesError.message}` };
    }

    // 4. Index existing profiles by user_id and email for fast lookup
    const profileByUserId = new Map<string, (typeof existingProfiles)[number]>();
    const profileByEmail = new Map<string, (typeof existingProfiles)[number]>();

    for (const profile of existingProfiles ?? []) {
      if (profile.user_id) profileByUserId.set(profile.user_id, profile);
      if (profile.email) profileByEmail.set(profile.email, profile);
    }

    // 5. Process all tickets in memory — no DB calls in this loop
    // Track updates keyed by profile ID to handle duplicate user_ids across tickets
    const updatesById = new Map<
      string,
      { total_events: number; total_spend: number; last_event_at: string; vip_status: boolean }
    >();
    const insertsById = new Map<
      string,
      { user_id?: string; email?: string; total_events: number; total_spend: number; first_event_at: string; last_event_at: string; vip_status: boolean }
    >();

    for (const ticket of tickets) {
      const userId = ticket.user_id;
      const meta = (ticket.metadata || {}) as Record<string, string>;
      const email = meta.customer_email || null;
      const ticketPrice = Number(ticket.price_paid) || 0;

      if (!userId) continue;

      // Look up existing profile
      const existing = profileByUserId.get(userId) ?? (email ? profileByEmail.get(email) : null);

      if (existing) {
        // Check if we already have a pending update for this profile
        const pending = updatesById.get(existing.id);
        if (pending) {
          // Accumulate onto the pending update
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
            total_events: newTotalEvents,
            total_spend: newTotalSpend,
            last_event_at: now,
            vip_status: isVip,
          });
        }
      } else {
        // New profile — use a key to deduplicate multiple tickets for same user
        const key = userId;
        const pending = insertsById.get(key);
        if (pending) {
          pending.total_events += 1;
          pending.total_spend = Math.round((pending.total_spend + ticketPrice) * 100) / 100;
          pending.vip_status =
            pending.total_events >= VIP_EVENT_THRESHOLD ||
            pending.total_spend >= VIP_SPEND_THRESHOLD;
        } else {
          const isVip =
            1 >= VIP_EVENT_THRESHOLD || ticketPrice >= VIP_SPEND_THRESHOLD;

          const insertData: { user_id?: string; email?: string; total_events: number; total_spend: number; first_event_at: string; last_event_at: string; vip_status: boolean } = {
            total_events: 1,
            total_spend: Math.round(ticketPrice * 100) / 100,
            first_event_at: now,
            last_event_at: now,
            vip_status: isVip,
          };

          if (userId) insertData.user_id = userId;
          if (email) insertData.email = email;

          insertsById.set(key, insertData);
        }
      }
    }

    // 6. Batch write: upsert all updates and inserts
    let enrichedCount = 0;

    // Batch updates — use upsert with the profile id
    if (updatesById.size > 0) {
      const upsertRows = Array.from(updatesById.entries()).map(([id, data]) => ({
        id,
        ...data,
      }));

      const { error: updateError } = await admin
        .from("attendee_profiles")
        .upsert(upsertRows, { onConflict: "id" });

      if (updateError) {
        console.error("Batch update failed:", updateError.message);
      } else {
        enrichedCount += upsertRows.length;
      }
    }

    // Batch inserts — insert all new profiles at once
    if (insertsById.size > 0) {
      const insertRows = Array.from(insertsById.values());

      const { error: insertError } = await admin
        .from("attendee_profiles")
        .insert(insertRows);

      if (insertError) {
        console.error("Batch insert failed:", insertError.message);
      } else {
        enrichedCount += insertRows.length;
      }
    }

    return { error: null, enriched: enrichedCount };
  } catch (err) {
    console.error("CRM enrichment error:", err);
    return {
      error:
        err instanceof Error ? err.message : "Unexpected CRM enrichment error.",
    };
  }
}
