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

  // Get event with collective_id and status
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

  // Fetch paid orders, artist bookings, and expenses in parallel
  const [{ data: paidOrders }, { data: bookings }, { data: expenses }] = await Promise.all([
    admin
      .from("orders")
      .select("id, total, platform_fee, stripe_fee")
      .eq("event_id", eventId)
      .eq("status", "paid"),
    admin
      .from("event_artists")
      .select("id, name, fee")
      .eq("event_id", eventId),
    admin
      .from("event_expenses")
      .select("id, description, amount, category")
      .eq("event_id", eventId),
  ]);

  // Revenue = sum of paid orders (orders.total = subtotal + buyer-paid fees)
  // total_revenue on the settlement = organizer gross = sum of order subtotals
  const grossRevenue = (paidOrders ?? []).reduce(
    (sum, o) => sum + (Number(o.total) || 0),
    0
  );

  // Platform and Stripe fees are buyer-paid (added on top of ticket price).
  // Record them for Nocturn-side reporting on the settlement.
  const totalPlatformFee = (paidOrders ?? []).reduce(
    (sum, o) => sum + (Number(o.platform_fee) || 0),
    0
  );
  const totalStripeFee = (paidOrders ?? []).reduce(
    (sum, o) => sum + (Number(o.stripe_fee) || 0),
    0
  );

  // Artist fees
  const totalArtistFees = (bookings ?? []).reduce(
    (sum, b) => sum + (Number(b.fee) || 0),
    0
  );

  // Expenses
  const totalExpenses = (expenses ?? []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );

  // Net payout = gross revenue minus artist fees and expenses.
  // Stripe and Nocturn platform fees are buyer-paid — they don't come out of
  // the organizer's payout, but we record them on the settlement for reporting.
  const netPayout = Math.round(
    (grossRevenue - totalArtistFees - totalExpenses) * 100
  ) / 100;

  // Create settlement with new schema columns
  const { data: settlement, error: settlementError } = await admin
    .from("settlements")
    .insert({
      event_id: eventId,
      collective_id: event.collective_id,
      status: "draft",
      total_revenue: Math.round(grossRevenue * 100) / 100,
      platform_fee: Math.round(totalPlatformFee * 100) / 100,
      stripe_fee: Math.round(totalStripeFee * 100) / 100,
      net_payout: netPayout,
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

  // Create line items using the new settlement_lines schema:
  // { settlement_id, order_id?, ticket_id?, description, amount, type }
  const lines: Array<{
    settlement_id: string;
    order_id?: string | null;
    ticket_id?: string | null;
    description: string;
    amount: number;
    type: string;
  }> = [];

  // Per-order revenue lines
  for (const order of paidOrders ?? []) {
    lines.push({
      settlement_id: settlement.id,
      order_id: order.id,
      description: "Ticket order revenue",
      amount: Number(order.total) || 0,
      type: "revenue",
    });
  }

  // Stripe fee line (buyer-paid, recorded for reporting)
  if (totalStripeFee > 0) {
    lines.push({
      settlement_id: settlement.id,
      description: "Stripe processing fees (buyer-paid)",
      amount: Math.round(totalStripeFee * 100) / 100,
      type: "stripe_fee",
    });
  }

  // Nocturn platform fee line (buyer-paid, recorded for reporting)
  if (totalPlatformFee > 0) {
    lines.push({
      settlement_id: settlement.id,
      description: `Nocturn service fee (${PLATFORM_FEE_PERCENT}% + $${(PLATFORM_FEE_FLAT_CENTS / 100).toFixed(2)}/ticket — buyer-paid)`,
      amount: Math.round(totalPlatformFee * 100) / 100,
      type: "platform_fee",
    });
  }

  // Artist fee lines
  for (const booking of bookings ?? []) {
    if ((Number(booking.fee) || 0) > 0) {
      lines.push({
        settlement_id: settlement.id,
        description: `Artist fee: ${booking.name ?? "Unknown"}`,
        amount: Number(booking.fee) || 0,
        type: "artist_fee",
      });
    }
  }

  // Expense lines
  for (const expense of expenses ?? []) {
    lines.push({
      settlement_id: settlement.id,
      description: `${expense.category}: ${expense.description ?? ""}`,
      amount: Number(expense.amount),
      type: "expense",
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
      profit: netPayout,
      orderCount: (paidOrders ?? []).length,
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

// Approve/finalize a settlement
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

  // Role check: only owners/admins can approve a settlement
  const { data: membership } = await admin
    .from("collective_members")
    .select("role")
    .eq("collective_id", settlement.collective_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) {
    return { error: "Only collective owners and admins can approve settlements" };
  }

  // New schema uses 'finalized' status and finalized_at timestamp
  const { data: updated, error } = await admin
    .from("settlements")
    .update({
      status: "finalized",
      finalized_at: new Date().toISOString(),
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
  if (!input.eventId || typeof input.eventId !== "string") return { error: "Invalid event ID" };
  if (!isValidUUID(input.eventId)) return { error: "Invalid event ID format" };
  if (!isAcceptedExpenseCategory(input.category)) return { error: "Invalid expense category" };
  if (!input.description || input.description.length > 500) return { error: "Description is required and must be under 500 characters" };
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1000000) return { error: "Amount must be between $0.01 and $1,000,000" };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

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

  // event_expenses schema: event_id, category, description, amount, is_paid, created_by
  const { error } = await admin.from("event_expenses").insert({
    event_id: input.eventId,
    category: input.category,
    description: input.description.slice(0, 500),
    amount: Math.round(input.amount * 100) / 100,
    is_paid: false,
    created_by: user.id,
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
