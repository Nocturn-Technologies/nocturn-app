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
  // Post-#93: events dropped deleted_at (status lifecycle replaces soft delete).
  const { data: ev, error: evError } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
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

    // 1. Get all paid/checked-in tickets for this event, joined through
    //    order_lines → orders to get pricing and buyer metadata.
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, holder_party_id, order_line_id, order_lines(unit_price, orders(metadata, party_id))")
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

    type TicketRow = {
      id: string;
      holder_party_id: string | null;
      order_line_id: string | null;
      order_lines: {
        unit_price: number;
        orders: {
          metadata: Record<string, unknown> | null;
          party_id: string;
        } | null;
      } | null;
    };

    const typedTickets = tickets as unknown as TicketRow[];

    // 2. Collect all unique party IDs and emails from tickets
    const partyIds: string[] = [];
    const emails: string[] = [];

    for (const ticket of typedTickets) {
      const holderParty = ticket.holder_party_id;
      if (holderParty) partyIds.push(holderParty);
      const orderParty = ticket.order_lines?.orders?.party_id;
      if (orderParty && !partyIds.includes(orderParty)) partyIds.push(orderParty);
      const meta = (ticket.order_lines?.orders?.metadata || {}) as Record<string, string>;
      if (meta.customer_email) emails.push(meta.customer_email.toLowerCase());
    }

    // 3. Fetch existing attendee_profiles for this collective (by party_id or email)
    let existingProfiles: {
      id: string;
      party_id: string | null;
      user_id: string | null;
      email: string | null;
      total_events: number;
      total_spend: number;
      first_seen_at: string | null;
    }[] = [];

    if (partyIds.length > 0) {
      const { data: byPartyId, error: err1 } = await admin
        .from("attendee_profiles")
        .select("id, party_id, user_id, email, total_events, total_spend, first_seen_at")
        .eq("collective_id", collectiveId)
        .in("party_id", partyIds);

      if (err1) {
        console.error("[enrichAttendeeCRM] attendee_profiles by party_id query error:", err1.message);
        return { error: "Failed to load attendee profiles" };
      }
      if (byPartyId) existingProfiles = byPartyId;
    }

    if (emails.length > 0) {
      const { data: byEmail, error: err2 } = await admin
        .from("attendee_profiles")
        .select("id, party_id, user_id, email, total_events, total_spend, first_seen_at")
        .eq("collective_id", collectiveId)
        .in("email", emails);

      if (err2) {
        console.error("[enrichAttendeeCRM] attendee_profiles by email query error:", err2.message);
        return { error: "Failed to load attendee profiles" };
      }
      if (byEmail) {
        const existingIds = new Set(existingProfiles.map((c) => c.id));
        for (const c of byEmail) {
          if (!existingIds.has(c.id)) existingProfiles.push(c);
        }
      }
    }

    // 4. Index by party_id and email for fast lookup
    const profileByPartyId = new Map<string, (typeof existingProfiles)[number]>();
    const profileByEmail = new Map<string, (typeof existingProfiles)[number]>();

    for (const p of existingProfiles ?? []) {
      if (p.party_id) profileByPartyId.set(p.party_id, p);
      if (p.email) profileByEmail.set(p.email.toLowerCase(), p);
    }

    // 5. Process all tickets in memory — no DB calls in this loop
    const updatesById = new Map<
      string,
      { party_id: string | null; total_events: number; total_spend: number; last_seen_at: string }
    >();
    const insertsByKey = new Map<
      string,
      {
        collective_id: string;
        party_id: string | null;
        email: string | null;
        total_events: number;
        total_spend: number;
        first_seen_at: string;
        last_seen_at: string;
      }
    >();

    for (const ticket of typedTickets) {
      const partyId = ticket.holder_party_id ?? ticket.order_lines?.orders?.party_id ?? null;
      const meta = (ticket.order_lines?.orders?.metadata || {}) as Record<string, string>;
      const email = meta.customer_email?.toLowerCase() || null;
      const ticketPrice = Number(ticket.order_lines?.unit_price) || 0;

      // Prefer email-based matching (attendee_profiles unique key is (collective_id, email)).
      const existing =
        (email ? profileByEmail.get(email) : null) ??
        (partyId ? profileByPartyId.get(partyId) : null);

      if (existing) {
        const pending = updatesById.get(existing.id);
        if (pending) {
          pending.total_events += 1;
          pending.total_spend = Math.round((pending.total_spend + ticketPrice) * 100) / 100;
        } else {
          const newTotalEvents = (existing.total_events ?? 0) + 1;
          const newTotalSpend =
            Math.round(((Number(existing.total_spend) || 0) + ticketPrice) * 100) / 100;

          updatesById.set(existing.id, {
            party_id: existing.party_id ?? partyId ?? null,
            total_events: newTotalEvents,
            total_spend: newTotalSpend,
            last_seen_at: now,
          });
        }
      } else {
        // New profile — key by email (falls back to party_id)
        const key = email ?? partyId;
        if (!key) continue;

        const pending = insertsByKey.get(key);
        if (pending) {
          pending.total_events += 1;
          pending.total_spend = Math.round((pending.total_spend + ticketPrice) * 100) / 100;
        } else {
          if (!email && !partyId) continue; // need at least one identifier
          insertsByKey.set(key, {
            collective_id: collectiveId,
            party_id: partyId ?? null,
            email: email ?? null,
            total_events: 1,
            total_spend: Math.round(ticketPrice * 100) / 100,
            first_seen_at: now,
            last_seen_at: now,
          });
        }
      }
    }

    // 6. Batch write
    let enrichedCount = 0;

    if (updatesById.size > 0) {
      const updateResults = await Promise.all(
        Array.from(updatesById.entries()).map(([id, data]) =>
          admin.from("attendee_profiles").update(data).eq("id", id)
        )
      );
      const updateFail = updateResults.find((r) => r.error);
      if (updateFail?.error) {
        console.error("[enrichAttendeeCRM] batch update failed:", updateFail.error.message);
        return { error: "Failed to update attendee profiles" };
      }
      enrichedCount += updatesById.size;
    }

    if (insertsByKey.size > 0) {
      const insertRows = Array.from(insertsByKey.values());

      const { error: insertError } = await admin
        .from("attendee_profiles")
        .upsert(insertRows, { onConflict: "collective_id,email" });

      if (insertError) {
        console.error("[enrichAttendeeCRM] batch insert failed:", insertError.message);
        return { error: "Failed to create attendee profiles" };
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
