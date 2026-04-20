"use server";

import { createAdminClient } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";

/**
 * Verify the authenticated user is a member of the event's collective.
 */
async function verifyCheckInAccess(eventId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("collective_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("[verifyCheckInAccess] event query error:", eventError.message);
      return { error: "Something went wrong" };
    }

    if (!event) return { error: "Event not found" };

    const { count, error: memberError } = await admin
      .from("collective_members")
      .select("*", { count: "exact", head: true })
      .eq("collective_id", event.collective_id)
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (memberError) {
      console.error("[verifyCheckInAccess] membership check error:", memberError.message);
      return { error: "Something went wrong" };
    }

    if (!count || count === 0) return { error: "You don't have access to this event" };

    return { error: null };
  } catch (err) {
    console.error("[verifyCheckInAccess] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Validate and check in a ticket by its QR code token.
 * - Verifies the caller is authenticated and a member of the event's collective
 * - Verifies the ticket exists and belongs to the given event
 * - Ensures ticket status is 'valid' (not already checked in, refunded, etc.)
 * - Updates status to 'checked_in' and inserts a ticket_events audit record
 */
export async function checkInTicket(ticketToken: string, eventId: string) {
  try {
    if (!ticketToken?.trim()) return { success: false, error: "Ticket token is required", ticket: null };
    if (!eventId?.trim()) return { success: false, error: "Event ID is required", ticket: null };

    // Auth check: only collective members can check in tickets
    const access = await verifyCheckInAccess(eventId);
    if (access.error) {
      return { success: false, error: access.error, ticket: null };
    }

    // Rate limit: 120 scans per minute per user (fast QR scanning)
    const { success: rlOk } = await rateLimitStrict(`checkin:${eventId}`, 120, 60_000);
    if (!rlOk) {
      return { success: false, error: "Too many check-in attempts. Please wait.", ticket: null };
    }

    const supabase = createAdminClient();

    // Fetch the ticket with event and tier info
    // In the new schema: qr_code = the UUID token, no user join (holder_party_id → parties)
    const { data: ticket, error: fetchError } = await supabase
      .from("tickets")
      .select(
        `
        id,
        event_id,
        status,
        qr_code,
        holder_party_id,
        tier_id,
        ticket_tiers:tier_id (name)
      `
      )
      .eq("qr_code", ticketToken)
      .maybeSingle();

    if (fetchError || !ticket) {
      return {
        success: false,
        error: "Ticket not found",
        ticket: null,
      };
    }

    // Verify ticket belongs to this event
    if (ticket.event_id !== eventId) {
      return {
        success: false,
        error: "This ticket is for a different event",
        ticket: null,
      };
    }

    // Resolve guest name/email from the holder's party
    let guestName = "Guest";
    let guestEmail: string | null = null;
    if (ticket.holder_party_id) {
      const [{ data: party }, { data: contactMethod }] = await Promise.all([
        supabase
          .from("parties")
          .select("display_name")
          .eq("id", ticket.holder_party_id)
          .maybeSingle(),
        supabase
          .from("party_contact_methods")
          .select("value")
          .eq("party_id", ticket.holder_party_id)
          .eq("type", "email")
          .eq("is_primary", true)
          .maybeSingle(),
      ]);
      if (party?.display_name) guestName = party.display_name;
      if (contactMethod?.value) guestEmail = contactMethod.value;
    }

    // Check current status
    if (ticket.status === "checked_in") {
      // Look up when they were checked in from ticket_events
      const { data: checkInEvent } = await supabase
        .from("ticket_events")
        .select("occurred_at")
        .eq("ticket_id", ticket.id)
        .eq("event_type", "checked_in")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const checkedInTime = checkInEvent?.occurred_at
        ? new Date(checkInEvent.occurred_at).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "earlier";

      return {
        success: false,
        error: `Already checked in at ${checkedInTime}`,
        duplicate: true,
        ticket: {
          tierName: ((ticket.ticket_tiers as Record<string, unknown> | null)?.name as string) ?? "General",
          guestName,
          guestEmail,
        },
      };
    }

    if (ticket.status !== "valid") {
      return {
        success: false,
        error: `Ticket status is '${ticket.status}' — only valid tickets can be checked in`,
        ticket: null,
      };
    }

    // Perform the check-in — atomic guard: only update if still "valid"
    // Prevents double check-in race condition from concurrent scans
    const now = new Date().toISOString();
    const { error: updateError, count: updateCount } = await supabase
      .from("tickets")
      .update({
        status: "checked_in",
      })
      .eq("id", ticket.id)
      .eq("status", "valid");

    if (updateError) {
      console.error("[check-in] Failed to update ticket:", updateError);
      return {
        success: false,
        error: "Failed to check in ticket. Please try again.",
        ticket: null,
      };
    }

    if (updateCount === 0) {
      return {
        success: false,
        error: "Ticket was already checked in by another scanner.",
        duplicate: true,
        ticket: {
          tierName: (ticket.ticket_tiers as unknown as { name: string } | null)?.name ?? "General",
          guestName,
          guestEmail,
        },
      };
    }

    // Insert ticket_events audit record for the check-in
    void supabase
      .from("ticket_events")
      .insert({
        ticket_id: ticket.id,
        event_type: "checked_in",
        party_id: null, // could be the staff's party_id if available
        metadata: { checked_in_at: now },
      })
      .then(() => {}, (e: unknown) => console.error("[check-in] ticket_events insert failed (non-blocking):", e));

    return {
      success: true,
      error: null,
      ticket: {
        tierName: (ticket.ticket_tiers as unknown as { name: string } | null)?.name ?? "General",
        guestName,
        guestEmail,
      },
    };
  } catch (err) {
    console.error("[checkInTicket]", err);
    return { success: false, error: "Something went wrong", ticket: null };
  }
}

export interface CheckInStats {
  totalTickets: number;
  checkedIn: number;
  recentCheckIns: {
    id: string;
    guestName: string;
    tierName: string;
    checkedInAt: string;
  }[];
}

/**
 * Get check-in statistics for an event:
 * - Total valid/checked_in tickets
 * - Number checked in
 * - Most recent check-ins (sourced from ticket_events)
 */
export async function getCheckInStats(eventId: string): Promise<CheckInStats> {
  try {
    if (!eventId?.trim()) return { totalTickets: 0, checkedIn: 0, recentCheckIns: [] };

    // Auth check: only collective members can view check-in stats
    const access = await verifyCheckInAccess(eventId);
    if (access.error) {
      return { totalTickets: 0, checkedIn: 0, recentCheckIns: [] };
    }

    const supabase = createAdminClient();

    // Count total eligible tickets (valid + checked_in)
    const { count: totalTickets } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["valid", "checked_in"]);

    // Count checked-in tickets
    const { count: checkedIn } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "checked_in");

    // Get recent check-ins: query checked_in tickets for this event,
    // then look up the check-in timestamp from ticket_events
    const { data: recentData } = await supabase
      .from("tickets")
      .select(
        `
        id,
        holder_party_id,
        ticket_tiers:tier_id (name)
      `
      )
      .eq("event_id", eventId)
      .eq("status", "checked_in")
      .order("created_at", { ascending: false })
      .limit(20);

    // For each checked-in ticket, look up the check-in event timestamp and guest name
    const recentCheckIns = await Promise.all(
      (recentData ?? []).map(async (t) => {
        const tierData = t.ticket_tiers as unknown as { name: string } | null;

        // Get the check-in timestamp
        const { data: checkInEvent } = await supabase
          .from("ticket_events")
          .select("occurred_at")
          .eq("ticket_id", t.id)
          .eq("event_type", "checked_in")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get the guest name from the holder party
        let guestName = "Guest";
        if (t.holder_party_id) {
          const { data: party } = await supabase
            .from("parties")
            .select("display_name")
            .eq("id", t.holder_party_id)
            .maybeSingle();
          if (party?.display_name) guestName = party.display_name;
        }

        return {
          id: t.id,
          guestName,
          tierName: tierData?.name ?? "General",
          checkedInAt: checkInEvent?.occurred_at ?? new Date().toISOString(),
        };
      })
    );

    return {
      totalTickets: totalTickets ?? 0,
      checkedIn: checkedIn ?? 0,
      recentCheckIns,
    };
  } catch (err) {
    console.error("[getCheckInStats]", err);
    return { totalTickets: 0, checkedIn: 0, recentCheckIns: [] };
  }
}
