"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FLAT_CENTS } from "@/lib/pricing";

// ── Types ────────────────────────────────────────────────────────────

export interface TicketTierRow {
  id: string;
  name: string;
  price: number;
  capacity: number;
  ticketsSold: number;
  revenue: number;
}

export interface ExpenseRow {
  id: string;
  description: string;
  category: string;
  amount: number;
}

export interface ArtistFeeRow {
  id: string;           // event_artists composite id
  artistName: string;
  fee: number;
}

export interface EventFinancials {
  eventId: string;
  eventTitle: string;
  ticketTiers: TicketTierRow[];
  expenses: ExpenseRow[];
  artistFees: ArtistFeeRow[];
  // Calculated totals
  grossRevenue: number;
  totalTicketsSold: number;
  totalExpenses: number;
  totalArtistFees: number;
  platformFees: number;
  stripeFees: number;
  netRevenue: number;
  profitLoss: number;
  // Event-level financial fields
  venueCost: number | null;
  venueDeposit: number | null;
  barMinimum: number | null;
  estimatedBarRevenue: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function verifyOwnership(userId: string, eventId: string) {
  const admin = createAdminClient();

  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found.", collectiveId: null };
  }

  const collectiveIds = memberships.map((m) => m.collective_id);

  const { data: event } = await admin
    .from("events")
    .select("id, collective_id, title, venue_cost, venue_deposit, bar_minimum, estimated_bar_revenue")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || !collectiveIds.includes(event.collective_id)) {
    return { error: "Event not found or access denied.", collectiveId: null };
  }

  return { error: null, event, collectiveId: event.collective_id };
}

// ── Get Event Financials ─────────────────────────────────────────────

export async function getEventFinancials(eventId: string): Promise<{ error: string | null; data: EventFinancials | null }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", data: null };

  const ownership = await verifyOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error, data: null };
  if (!ownership.event) return { error: "Event not found.", data: null };

  const admin = createAdminClient();
  const event = ownership.event;

  // Parallel queries
  const [tiersRes, ticketsRes, expensesRes, artistsRes] = await Promise.all([
    admin
      .from("ticket_tiers")
      .select("id, name, price, capacity, sort_order")
      .eq("event_id", eventId)
      .order("sort_order"),
    admin
      .from("tickets")
      .select("id, ticket_tier_id, price_paid, status")
      .eq("event_id", eventId)
      .in("status", ["paid", "checked_in"]),
    admin
      .from("expenses")
      .select("id, description, category, amount")
      .eq("event_id", eventId)
      .order("created_at"),
    admin
      .from("event_artists")
      .select("event_id, artist_id, fee, artists(name)")
      .eq("event_id", eventId),
  ]);

  const tiers = tiersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const eventArtists = artistsRes.data ?? [];

  // Build ticket tier rows with sold counts
  const ticketTiers: TicketTierRow[] = tiers.map((tier) => {
    const tierTickets = tickets.filter((t) => t.ticket_tier_id === tier.id);
    const revenue = tierTickets.reduce((sum, t) => sum + (Number(t.price_paid) || 0), 0);
    return {
      id: tier.id,
      name: tier.name,
      price: Number(tier.price),
      capacity: tier.capacity ?? 0,
      ticketsSold: tierTickets.length,
      revenue: Math.round(revenue * 100) / 100,
    };
  });

  // Build expense rows
  const expenseRows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    description: e.description ?? "",
    category: e.category ?? "other",
    amount: Number(e.amount) || 0,
  }));

  // Build artist fee rows
  const artistFeeRows: ArtistFeeRow[] = eventArtists.map((ea) => {
    const artist = ea.artists as unknown as { name: string } | null;
    return {
      id: `${ea.event_id}_${ea.artist_id}`,
      artistName: artist?.name ?? "Unknown Artist",
      fee: Number(ea.fee) || 0,
    };
  });

  // Calculate totals
  const grossRevenue = ticketTiers.reduce((sum, t) => sum + t.revenue, 0);
  const totalTicketsSold = ticketTiers.reduce((sum, t) => sum + t.ticketsSold, 0);
  const totalExpenses = expenseRows.reduce((sum, e) => sum + e.amount, 0);
  const totalArtistFees = artistFeeRows.reduce((sum, a) => sum + a.fee, 0);

  // Platform fees (buyer pays — not deducted from organizer)
  const platformFees = grossRevenue * (PLATFORM_FEE_PERCENT / 100) + (PLATFORM_FEE_FLAT_CENTS / 100) * totalTicketsSold;

  // Stripe fees (~2.9% + $0.30 per transaction)
  const stripeFees = grossRevenue > 0
    ? grossRevenue * 0.029 + 0.30 * totalTicketsSold
    : 0;

  const venueCostNum = event.venue_cost ? Number(event.venue_cost) : 0;
  const venueDepositNum = event.venue_deposit ? Number(event.venue_deposit) : 0;
  const netRevenue = grossRevenue - stripeFees;
  const profitLoss = netRevenue - totalExpenses - totalArtistFees - venueCostNum - venueDepositNum;

  return {
    error: null,
    data: {
      eventId,
      eventTitle: event.title,
      ticketTiers,
      expenses: expenseRows,
      artistFees: artistFeeRows,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      totalTicketsSold,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalArtistFees: Math.round(totalArtistFees * 100) / 100,
      platformFees: Math.round(platformFees * 100) / 100,
      stripeFees: Math.round(stripeFees * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      profitLoss: Math.round(profitLoss * 100) / 100,
      venueCost: event.venue_cost ? Number(event.venue_cost) : null,
      venueDeposit: event.venue_deposit ? Number(event.venue_deposit) : null,
      barMinimum: event.bar_minimum ? Number(event.bar_minimum) : null,
      estimatedBarRevenue: event.estimated_bar_revenue ? Number(event.estimated_bar_revenue) : null,
    },
  };
}

// ── Add Expense ──────────────────────────────────────────────────────

const VALID_EXPENSE_CATEGORIES = [
  "venue", "sound", "lighting", "dj", "artist", "promotion",
  "security", "staff", "decor", "insurance", "permits", "transportation",
  "hospitality", "equipment", "miscellaneous", "other",
];

export async function addExpense(eventId: string, data: { description: string; category: string; amount: number }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Validate inputs
  const desc = (data.description ?? "").trim();
  if (!desc) return { error: "Description is required." };
  if (desc.length > 500) return { error: "Description must be under 500 characters." };
  if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Amount must be a positive number." };
  if (data.amount > 9999999.99) return { error: "Amount is too large." };
  const category = VALID_EXPENSE_CATEGORIES.includes(data.category) ? data.category : "other";
  const amount = Math.round(data.amount * 100) / 100;

  const ownership = await verifyOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("expenses")
    .insert({
      event_id: eventId,
      collective_id: ownership.collectiveId!,
      description: desc,
      category,
      amount,
    });

  if (error) return { error: `Failed to add expense: ${error.message}` };

  revalidatePath(`/dashboard/events/${eventId}/financials`);
  return { error: null };
}

// ── Update Expense ───────────────────────────────────────────────────

export async function updateExpense(expenseId: string, data: { description?: string; category?: string; amount?: number }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Validate inputs
  if (data.description !== undefined) {
    const desc = data.description.trim();
    if (!desc) return { error: "Description is required." };
    if (desc.length > 500) return { error: "Description must be under 500 characters." };
  }
  if (data.amount !== undefined) {
    if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Amount must be a positive number." };
    if (data.amount > 9999999.99) return { error: "Amount is too large." };
  }
  if (data.category !== undefined && !VALID_EXPENSE_CATEGORIES.includes(data.category)) {
    data.category = "other";
  }

  const admin = createAdminClient();

  // Get expense to find event_id for ownership check
  const { data: expense } = await admin
    .from("expenses")
    .select("event_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (!expense) return { error: "Expense not found" };

  const ownership = await verifyOwnership(user.id, expense.event_id);
  if (ownership.error) return { error: ownership.error };

  const updatePayload: Record<string, unknown> = {};
  if (data.description !== undefined) updatePayload.description = data.description.trim();
  if (data.category !== undefined) updatePayload.category = data.category;
  if (data.amount !== undefined) updatePayload.amount = Math.round(data.amount * 100) / 100;

  const { error } = await admin
    .from("expenses")
    .update(updatePayload)
    .eq("id", expenseId);

  if (error) return { error: `Failed to update expense: ${error.message}` };

  revalidatePath(`/dashboard/events/${expense.event_id}/financials`);
  return { error: null };
}

// ── Delete Expense ───────────────────────────────────────────────────

export async function deleteExpense(expenseId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: expense } = await admin
    .from("expenses")
    .select("event_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (!expense) return { error: "Expense not found" };

  const ownership = await verifyOwnership(user.id, expense.event_id);
  if (ownership.error) return { error: ownership.error };

  const { error } = await admin
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (error) return { error: `Failed to delete expense: ${error.message}` };

  revalidatePath(`/dashboard/events/${expense.event_id}/financials`);
  return { error: null };
}
