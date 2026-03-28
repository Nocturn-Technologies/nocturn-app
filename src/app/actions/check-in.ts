"use server";

import { createAdminClient } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Verify the authenticated user is a member of the event's collective.
 */
async function verifyCheckInAccess(eventId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found" };

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id);

  if (!count || count === 0) return { error: "You don't have access to this event" };

  return { error: null };
}

/**
 * Validate and check in a ticket by its token.
 * - Verifies the caller is authenticated and a member of the event's collective
 * - Verifies the ticket exists and belongs to the given event
 * - Ensures ticket status is 'paid' (not already checked in, refunded, etc.)
 * - Updates status to 'checked_in' with timestamp
 */
export async function checkInTicket(ticketToken: string, eventId: string) {
  // Auth check: only collective members can check in tickets
  const access = await verifyCheckInAccess(eventId);
  if (access.error) {
    return { success: false, error: access.error, ticket: null };
  }

  const supabase = createAdminClient();

  // Fetch the ticket with event and tier info
  const { data: ticket, error: fetchError } = await supabase
    .from("tickets")
    .select(
      `
      id,
      event_id,
      status,
      checked_in_at,
      ticket_token,
      ticket_tiers:ticket_tier_id (name),
      profiles:user_id (full_name, email)
    `
    )
    .eq("ticket_token", ticketToken)
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

  // Check current status
  if (ticket.status === "checked_in") {
    const checkedInTime = ticket.checked_in_at
      ? new Date(ticket.checked_in_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "earlier";

    return {
      success: false,
      error: `Already checked in at ${checkedInTime}`,
      ticket: {
        tierName: (ticket.ticket_tiers as unknown as { name: string } | null)?.name ?? "General",
        guestName: (ticket.profiles as unknown as { full_name: string; email: string } | null)?.full_name ?? "Guest",
        guestEmail: (ticket.profiles as unknown as { full_name: string; email: string } | null)?.email ?? null,
      },
    };
  }

  if (ticket.status !== "paid") {
    return {
      success: false,
      error: `Ticket status is '${ticket.status}' — only paid tickets can be checked in`,
      ticket: null,
    };
  }

  // Perform the check-in
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("tickets")
    .update({
      status: "checked_in",
      checked_in_at: now,
    })
    .eq("id", ticket.id);

  if (updateError) {
    console.error("[check-in] Failed to update ticket:", updateError);
    return {
      success: false,
      error: "Failed to check in ticket. Please try again.",
      ticket: null,
    };
  }

  return {
    success: true,
    error: null,
    ticket: {
      tierName: (ticket.ticket_tiers as unknown as { name: string } | null)?.name ?? "General",
      guestName: (ticket.profiles as unknown as { full_name: string; email: string } | null)?.full_name ?? "Guest",
      guestEmail: (ticket.profiles as unknown as { full_name: string; email: string } | null)?.email ?? null,
    },
  };
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
 * - Total paid/checked_in tickets
 * - Number checked in
 * - Most recent check-ins
 */
export async function getCheckInStats(eventId: string): Promise<CheckInStats> {
  // Auth check: only collective members can view check-in stats
  const access = await verifyCheckInAccess(eventId);
  if (access.error) {
    return { totalTickets: 0, checkedIn: 0, recentCheckIns: [] };
  }

  const supabase = createAdminClient();

  // Count total eligible tickets (paid + checked_in)
  const { count: totalTickets } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ["paid", "checked_in"]);

  // Count checked-in tickets
  const { count: checkedIn } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "checked_in");

  // Get recent check-ins (last 20)
  const { data: recentData } = await supabase
    .from("tickets")
    .select(
      `
      id,
      checked_in_at,
      profiles:user_id (full_name),
      ticket_tiers:ticket_tier_id (name)
    `
    )
    .eq("event_id", eventId)
    .eq("status", "checked_in")
    .not("checked_in_at", "is", null)
    .order("checked_in_at", { ascending: false })
    .limit(20);

  const recentCheckIns = (recentData ?? []).map((t) => ({
    id: t.id,
    guestName:
      (t.profiles as unknown as { full_name: string } | null)?.full_name ?? "Guest",
    tierName:
      (t.ticket_tiers as unknown as { name: string } | null)?.name ?? "General",
    checkedInAt: t.checked_in_at!,
  }));

  return {
    totalTickets: totalTickets ?? 0,
    checkedIn: checkedIn ?? 0,
    recentCheckIns,
  };
}
