"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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
    .single();

  if (!event) return { error: "Event not found" };
  if (event.status !== "completed") return { error: "Event must be completed before settlement" };

  // Check if settlement already exists
  const { data: existing } = await admin
    .from("settlements")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) return { error: "Settlement already exists", settlementId: existing.id };

  // Calculate revenue from paid tickets
  const { data: tickets } = await admin
    .from("tickets")
    .select("price_paid")
    .eq("event_id", eventId)
    .eq("status", "paid");

  const grossRevenue = (tickets ?? []).reduce(
    (sum, t) => sum + (Number(t.price_paid) || 0),
    0
  );

  // Stripe fees (~2.9% + $0.30 per transaction, approximate)
  const ticketCount = tickets?.length ?? 0;
  const stripeFees = Math.round((grossRevenue * 0.029 + ticketCount * 0.30) * 100) / 100;

  // Platform fee (5%)
  const platformFee = Math.round(grossRevenue * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;

  // Get artist fees
  const { data: bookings } = await admin
    .from("event_artists")
    .select("artist_id, fee, artists(name)")
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  const totalArtistFees = (bookings ?? []).reduce(
    (sum, b) => sum + (Number(b.fee) || 0),
    0
  );

  // Get expenses
  const { data: expenses } = await admin
    .from("event_expenses")
    .select("id, description, amount, category")
    .eq("event_id", eventId);

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

  if (settlementError) return { error: settlementError.message };

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

  // Platform fee line
  lines.push({
    settlement_id: settlement.id,
    type: "platform_fee",
    label: `Nocturn platform fee (${PLATFORM_FEE_PERCENT}%)`,
    amount: platformFee,
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
    await admin.from("settlement_lines").insert(lines);
  }

  return { error: null, settlementId: settlement.id };
}

// Approve a settlement
export async function approveSettlement(settlementId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { error } = await admin
    .from("settlements")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlementId)
    .eq("status", "draft");

  if (error) return { error: error.message };
  return { error: null };
}

// Get settlement for an event
export async function getSettlement(eventId: string) {
  const admin = createAdminClient();

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
    .single();

  if (!event) return { error: "Event not found" };

  const { error } = await admin.from("event_expenses").insert({
    event_id: input.eventId,
    collective_id: event.collective_id,
    category: input.category,
    description: input.description,
    amount: input.amount,
    added_by: user.id,
  });

  if (error) return { error: error.message };
  return { error: null };
}

// Get expenses for an event
export async function getEventExpenses(eventId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("event_expenses")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
