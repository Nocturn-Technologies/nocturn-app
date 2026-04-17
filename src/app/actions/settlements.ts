"use server";
import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FLAT_CENTS } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/config";
import { isValidUUID } from "@/lib/utils";
import { isAcceptedExpenseCategory } from "@/lib/expense-categories";

// Generate a settlement for a completed event
export async function generateSettlement(eventId: string) {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required" };
  if (!isValidUUID(eventId)) return { error: "Invalid event ID format" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get event with collective
  const { data: event } = await admin
    .from("events")
    .select("id, title, collective_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found" };
  if (event.status !== "completed") return { error: "Event must be completed before settlement" };

  // Verify user is a member of this collective
  const { count: memberCount } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!memberCount || memberCount === 0) return { error: "You don't have permission to generate this settlement" };

  // Check if settlement already exists
  const { data: existing } = await admin
    .from("settlements")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) return { error: "Settlement already exists", settlementId: existing.id };

  // Fetch tickets, refunded tickets, artist bookings, and expenses in parallel
  const [{ data: tickets }, { data: refundedTickets }, { data: bookings }, { data: expenses }] = await Promise.all([
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
    admin
      .from("event_artists")
      .select("artist_id, fee, artists(name)")
      .eq("event_id", eventId)
      .eq("status", "confirmed"),
    admin
      .from("event_expenses")
      .select("id, description, amount, category")
      .eq("event_id", eventId),
  ]);

  const grossRevenue = (tickets ?? []).reduce(
    (sum, t) => sum + (Number(t.price_paid) || 0),
    0
  );

  const refundsTotal = (refundedTickets ?? []).reduce(
    (sum, t) => sum + (Number(t.price_paid) || 0),
    0
  );

  // Nocturn is merchant of record — buyer pays the 7%+$0.50 service fee on
  // top, and Nocturn absorbs Stripe (2.9% + $0.30). Neither is deducted from
  // the organizer's net. Stripe + Nocturn revenue lines are kept on the
  // settlement record for Nocturn-side reporting only; they do not flow into
  // `netRevenue` or `profit`.
  const ticketCount = tickets?.length ?? 0;
  const stripeFees = Math.round((grossRevenue * 0.029 + ticketCount * 0.30) * 100) / 100;
  const platformFee = 0; // Organizer keeps 100% of ticket price
  const nocturnRevenue = Math.round((grossRevenue * (PLATFORM_FEE_PERCENT / 100) + ticketCount * (PLATFORM_FEE_FLAT_CENTS / 100)) * 100) / 100;

  const totalArtistFees = (bookings ?? []).reduce(
    (sum, b) => sum + (Number(b.fee) || 0),
    0
  );

  const totalExpenses = (expenses ?? []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );

  // Organizer-side net = gross − refunds only. No Stripe deduction (was the
  // old bug — phantom $400+ phantom subtraction on a typical event).
  const netRevenue = grossRevenue - refundsTotal;
  const profit = netRevenue - totalArtistFees - totalExpenses;

  // Create settlement
  const { data: settlement, error: settlementError } = await admin
    .from("settlements")
    .insert({
      event_id: eventId,
      collective_id: event.collective_id,
      status: "draft",
      gross_revenue: grossRevenue,
      stripe_fees: stripeFees,
      platform_fee: platformFee,
      net_revenue: netRevenue,
      total_costs: totalExpenses,
      total_artist_fees: totalArtistFees,
      profit: profit,
    })
    .select("id")
    .maybeSingle();

  if (settlementError) {
    // Handle unique constraint violation (race condition — another process created it first)
    if (settlementError.code === "23505") {
      const { data: raceSettlement } = await admin
        .from("settlements")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      return { error: "Settlement already exists", settlementId: raceSettlement?.id };
    }
    console.error("[generateSettlement] insert error:", settlementError.message);
    return { error: "Failed to create settlement" };
  }

  if (!settlement) {
    return { error: "Failed to create settlement" };
  }

  // Create line items
  const lines: Array<{
    settlement_id: string;
    description: string;
    amount: number;
    category?: string;
    metadata?: { type: string; recipient_type?: string; recipient_id?: string };
  }> = [];

  // Stripe fee line
  lines.push({
    settlement_id: settlement.id,
    description: "Stripe processing fees",
    amount: stripeFees,
    category: "stripe_fee",
    metadata: { type: "stripe_fee", recipient_type: "platform" },
  });

  // Nocturn service fee (paid by buyer, not deducted from collective)
  lines.push({
    settlement_id: settlement.id,
    description: `Nocturn service fee (${PLATFORM_FEE_PERCENT}% + $0.50/ticket — paid by buyer)`,
    amount: nocturnRevenue,
    category: "platform_fee",
    metadata: { type: "platform_fee", recipient_type: "platform" },
  });

  // Artist fee lines
  for (const booking of bookings ?? []) {
    const artist = booking.artists as unknown as { name: string } | null;
    lines.push({
      settlement_id: settlement.id,
      description: `Artist fee: ${artist?.name ?? "Unknown"}`,
      amount: Number(booking.fee) || 0,
      category: "artist_fee",
      metadata: { type: "artist_fee", recipient_type: "artist", recipient_id: booking.artist_id },
    });
  }

  // Expense lines
  for (const expense of expenses ?? []) {
    lines.push({
      settlement_id: settlement.id,
      description: `${expense.category}: ${expense.description}`,
      amount: Number(expense.amount),
      category: "expense",
      metadata: { type: "expense" },
    });
  }

  if (lines.length > 0) {
    const { error: linesError } = await admin.from("settlement_lines").insert(lines);
    if (linesError) {
      console.error("Failed to create settlement lines:", linesError);
      // Settlement exists but lines failed — return warning
      revalidatePath("/dashboard/finance"); return { error: null, settlementId: settlement.id, warning: "Settlement created but some line items may be missing" };
    }
  }

  try {
    const { trackServerEvent } = await import("@/lib/track-server");
    await trackServerEvent("settlement_generated", {
      eventId,
      settlementId: settlement.id,
      grossRevenue,
      profit,
      ticketCount,
    });
  } catch (trackErr) {
    console.error("[generateSettlement] Tracking failed:", trackErr);
  }

  revalidatePath("/dashboard/finance"); return { error: null, settlementId: settlement.id };
  } catch (err) {
    console.error("[generateSettlement] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

// Approve a settlement
export async function approveSettlement(settlementId: string) {
  try {
  if (!settlementId?.trim()) return { error: "Settlement ID is required" };
  if (!isValidUUID(settlementId)) return { error: "Invalid settlement ID format" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Verify user owns this settlement's collective
  const { data: settlement } = await admin
    .from("settlements")
    .select("collective_id")
    .eq("id", settlementId)
    .maybeSingle();

  if (!settlement) return { error: "Settlement not found" };

  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", settlement.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have permission to approve this settlement" };

  const { data: updated, error } = await admin
    .from("settlements")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlementId)
    .eq("status", "draft")
    .select("id");

  if (error) {
    console.error("[approveSettlement] update error:", error.message);
    return { error: "Failed to approve settlement" };
  }

  if (!updated || updated.length === 0) {
    return { error: "Settlement is not in draft status" };
  }

  revalidatePath("/dashboard/finance"); return { error: null };
  } catch (err) {
    console.error("[approveSettlement] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

// Get settlement for an event
export async function getSettlement(eventId: string) {
  try {
  if (!eventId?.trim()) return { error: "Event ID is required", settlement: null, lines: [] };
  if (!isValidUUID(eventId)) return { error: "Invalid event ID format", settlement: null, lines: [] };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", settlement: null, lines: [] };

  const admin = createAdminClient();

  // Look up the event's collective_id
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found", settlement: null, lines: [] };

  // Verify user is a member of this collective
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "Not authorized", settlement: null, lines: [] };

  const { data: settlement, error: settlementError } = await admin
    .from("settlements")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (settlementError) {
    console.error("[getSettlement] DB error:", settlementError);
    return { error: "Something went wrong", settlement: null, lines: [] };
  }
  if (!settlement) return { settlement: null, lines: [] };

  const { data: lines, error: linesError } = await admin
    .from("settlement_lines")
    .select("*")
    .eq("settlement_id", settlement.id)
    .order("created_at");

  if (linesError) {
    console.error("[getSettlement] Failed to fetch lines:", linesError);
  }

  return { settlement, lines: lines ?? [] };
  } catch (err) {
    console.error("[getSettlement] Unexpected error:", err);
    return { error: "Something went wrong", settlement: null, lines: [] };
  }
}

// Add an expense to an event
export async function addEventExpense(input: {
  eventId: string;
  category: string;
  description: string;
  amount: number;
}) {
  try {
  // Input validation — category list is shared via `@/lib/expense-categories`
  // so this file, event-financials.ts, and the wizard all agree on what
  // "valid" means (they used to diverge — `supply` and `travel` were only
  // accepted here, `dj`/`artist` only on event-financials, etc.)
  if (!input.eventId || typeof input.eventId !== "string") return { error: "Invalid event ID" };
  if (!isValidUUID(input.eventId)) return { error: "Invalid event ID format" };
  if (!isAcceptedExpenseCategory(input.category)) return { error: "Invalid expense category" };
  if (!input.description || input.description.length > 500) return { error: "Description is required and must be under 500 characters" };
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1000000) return { error: "Amount must be between $0.01 and $1,000,000" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get collective_id + status. Expense edits on completed/archived events
  // silently shift P&L on already-generated settlements — so we gate writes
  // to pre-completion statuses only. Operators who need to correct a settled
  // event must regenerate the settlement.
  const { data: event } = await admin
    .from("events")
    .select("collective_id, status")
    .eq("id", input.eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found" };
  if (event.status !== "draft" && event.status !== "published") {
    return { error: "Can't add expenses to a completed or archived event. Regenerate the settlement instead." };
  }

  // Verify user is a member of this collective
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return { error: "You don't have permission to add expenses to this event" };

  const { error } = await admin.from("event_expenses").insert({
    event_id: input.eventId,
    collective_id: event.collective_id,
    category: input.category,
    description: input.description.slice(0, 500),
    amount: Math.round(input.amount * 100) / 100, // Round to 2 decimal places
    added_by: user.id,
  });

  if (error) {
    console.error("[addEventExpense] insert error:", error.message);
    return { error: "Failed to add expense" };
  }
  revalidatePath("/dashboard/finance"); return { error: null };
  } catch (err) {
    console.error("[addEventExpense] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

// Get expenses for an event
export async function getEventExpenses(eventId: string) {
  try {
  if (!eventId?.trim()) {
    console.error("[getEventExpenses] Missing event ID");
    return [];
  }
  if (!isValidUUID(eventId)) {
    console.error("[getEventExpenses] Invalid event ID format");
    return [];
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error("[getEventExpenses] Not authenticated");
    return [];
  }

  const admin = createAdminClient();

  // Get event's collective_id
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error("[getEventExpenses] Failed to look up event:", eventError);
    return [];
  }
  if (!event) {
    console.error("[getEventExpenses] Event not found:", eventId);
    return [];
  }

  // Verify user is a member of this collective
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) {
    console.error("[getEventExpenses] User not authorized for event:", eventId);
    return [];
  }

  const { data, error: expensesError } = await admin
    .from("event_expenses")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (expensesError) {
    console.error("[getEventExpenses] Failed to fetch expenses:", expensesError);
    return [];
  }

  return data ?? [];
  } catch (err) {
    console.error("[getEventExpenses] Unexpected error:", err);
    return [];
  }
}
