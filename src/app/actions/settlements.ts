"use server";
import { revalidatePath } from "next/cache";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/config";

// Generate a settlement for a completed event
export async function generateSettlement(eventId: string) {
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

  // Fetch tickets, artist bookings, and expenses in parallel
  const [{ data: tickets }, { data: bookings }, { data: expenses }] = await Promise.all([
    admin
      .from("tickets")
      .select("price_paid")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]),
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

  // Stripe processing fees (~2.9% + $0.30 per transaction, estimated)
  const ticketCount = tickets?.length ?? 0;
  const stripeFees = Math.round((grossRevenue * 0.029 + ticketCount * 0.30) * 100) / 100;

  // Platform fee: 7% + $0.50/ticket — BUT buyer pays this as a surcharge
  // So the platform fee does NOT reduce the collective's revenue
  // We track it for reporting but it comes from the service fee, not ticket revenue
  const platformFee = 0; // Collective keeps 100% of ticket price
  const nocturnRevenue = Math.round((grossRevenue * (PLATFORM_FEE_PERCENT / 100) + ticketCount * 0.50) * 100) / 100;

  const totalArtistFees = (bookings ?? []).reduce(
    (sum, b) => sum + (Number(b.fee) || 0),
    0
  );

  const totalExpenses = (expenses ?? []).reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  );

  // Calculate net and profit
  const netRevenue = grossRevenue - stripeFees - platformFee;
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
      total_expenses: totalExpenses,
      total_artist_fees: totalArtistFees,
      profit: profit,
    })
    .select("id")
    .single();

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
    return { error: settlementError.message };
  }

  // Create line items
  const lines: Array<{
    settlement_id: string;
    type: string;
    label: string;
    amount: number;
    recipient_type?: string;
    recipient_id?: string;
  }> = [];

  // Stripe fee line
  lines.push({
    settlement_id: settlement.id,
    type: "stripe_fee",
    label: "Stripe processing fees",
    amount: stripeFees,
    recipient_type: "platform",
  });

  // Nocturn service fee (paid by buyer, not deducted from collective)
  lines.push({
    settlement_id: settlement.id,
    type: "platform_fee",
    label: `Nocturn service fee (${PLATFORM_FEE_PERCENT}% + $0.50/ticket — paid by buyer)`,
    amount: nocturnRevenue,
    recipient_type: "platform",
  });

  // Artist fee lines
  for (const booking of bookings ?? []) {
    const artist = booking.artists as unknown as { name: string } | null;
    lines.push({
      settlement_id: settlement.id,
      type: "artist_fee",
      label: `Artist fee: ${artist?.name ?? "Unknown"}`,
      amount: Number(booking.fee) || 0,
      recipient_type: "artist",
      recipient_id: booking.artist_id,
    });
  }

  // Expense lines
  for (const expense of expenses ?? []) {
    lines.push({
      settlement_id: settlement.id,
      type: "expense",
      label: `${expense.category}: ${expense.description}`,
      amount: Number(expense.amount),
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

  import("@/lib/track-server").then(({ trackServerEvent }) =>
    trackServerEvent("settlement_generated", {
      eventId,
      settlementId: settlement.id,
      grossRevenue,
      profit,
      ticketCount,
    })
  ).catch(() => {});

  revalidatePath("/dashboard/finance"); return { error: null, settlementId: settlement.id };
}

// Approve a settlement
export async function approveSettlement(settlementId: string) {
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

  if (error) return { error: error.message };

  if (!updated || updated.length === 0) {
    return { error: "Settlement is not in draft status" };
  }

  revalidatePath("/dashboard/finance"); return { error: null };
}

// Get settlement for an event
export async function getSettlement(eventId: string) {
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

  const { data: settlement } = await admin
    .from("settlements")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!settlement) return { settlement: null, lines: [] };

  const { data: lines } = await admin
    .from("settlement_lines")
    .select("*")
    .eq("settlement_id", settlement.id)
    .order("created_at");

  return { settlement, lines: lines ?? [] };
}

// Add an expense to an event
export async function addEventExpense(input: {
  eventId: string;
  category: string;
  description: string;
  amount: number;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  // Get collective_id from event
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", input.eventId)
    .maybeSingle();

  if (!event) return { error: "Event not found" };

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
    description: input.description,
    amount: input.amount,
    added_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/finance"); return { error: null };
}

// Get expenses for an event
export async function getEventExpenses(eventId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();

  // Get event's collective_id
  const { data: event } = await admin
    .from("events")
    .select("collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return [];

  // Verify user is a member of this collective
  const { count } = await admin
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("collective_id", event.collective_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (!count || count === 0) return [];

  const { data } = await admin
    .from("event_expenses")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
