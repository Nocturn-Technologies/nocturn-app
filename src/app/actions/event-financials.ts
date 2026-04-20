"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";
import { getProjectedBarRevenue, readEventCommercialConfig } from "@/lib/event-commercials";

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
  // Legacy FX fields — kept for UI compatibility but always null in new schema
  originalAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  fxLockedAt: string | null;
}

export interface RevenueLineRow {
  id: string;
  description: string;
  category: string;
  amount: number;
}

export interface ArtistFeeRow {
  id: string;
  artistName: string;
  fee: number;
}

export interface EventFinancials {
  eventId: string;
  eventTitle: string;
  /**
   * Always 'cad' — the new schema removed per-event currency and
   * collectives.default_currency. All amounts are in CAD.
   */
  currency: string;
  ticketTiers: TicketTierRow[];
  expenses: ExpenseRow[];
  revenueLines: RevenueLineRow[];
  artistFees: ArtistFeeRow[];
  // Calculated totals
  ticketRevenue: number;
  additionalRevenue: number;
  grossRevenue: number;
  totalTicketsSold: number;
  totalExpenses: number;
  totalArtistFees: number;
  barShortfall: number;
  profitLoss: number;
  // Event-level financial fields — null in new schema (columns removed)
  venueCost: number | null;
  venueDeposit: number | null;
  barMinimum: number | null;
  estimatedBarRevenue: number | null;
  actualBarRevenue: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function verifyOwnership(userId: string, eventId: string) {
  const admin = createAdminClient();

  const { data: memberships, error: membershipsError } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (membershipsError) {
    console.error("[verifyOwnership] memberships query error:", membershipsError.message);
    return { error: "Failed to verify membership.", collectiveId: null };
  }

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found.", collectiveId: null };
  }

  const collectiveIds = memberships.map((m) => m.collective_id);

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, collective_id, title, metadata")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error("[verifyOwnership] event query error:", eventError.message);
    return { error: "Failed to load event.", collectiveId: null };
  }

  if (!event || !collectiveIds.includes(event.collective_id)) {
    return { error: "Event not found or access denied.", collectiveId: null };
  }

  return { error: null, event, collectiveId: event.collective_id };
}

// ── Get Event Financials ─────────────────────────────────────────────

export async function getEventFinancials(eventId: string): Promise<{ error: string | null; data: EventFinancials | null }> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated", data: null };

    if (!eventId?.trim()) return { error: "Event ID is required", data: null };

    const ownership = await verifyOwnership(user.id, eventId);
    if (ownership.error) return { error: ownership.error, data: null };
    if (!ownership.event) return { error: "Event not found.", data: null };

    const admin = createAdminClient();
    const event = ownership.event;

    // All amounts are in CAD — new schema removed per-event currency columns
    const reportingCurrency = "cad";

    // Parallel queries.
    // Revenue now comes from orders (paid), not individual ticket price_paid.
    // ticket_tiers has tickets_sold counter; use orders + order_lines for revenue breakdown per tier.
    // order_lines are fetched in a second pass after we have the order IDs.
    const [tiersRes, ordersRes, expensesRes, artistsRes] = await Promise.all([
      admin
        .from("ticket_tiers")
        .select("id, name, price, capacity, tickets_sold, sort_order")
        .eq("event_id", eventId)
        .order("sort_order"),
      admin
        .from("orders")
        .select("id, total, subtotal, platform_fee, stripe_fee")
        .eq("event_id", eventId)
        .eq("status", "paid"),
      admin
        .from("event_expenses")
        .select("id, description, category, amount")
        .eq("event_id", eventId)
        .order("created_at"),
      admin
        .from("event_artists")
        .select("id, event_id, name, fee")
        .eq("event_id", eventId),
    ]);

    if (tiersRes.error || ordersRes.error || expensesRes.error || artistsRes.error) {
      console.error("[getEventFinancials]", tiersRes.error || ordersRes.error || expensesRes.error || artistsRes.error);
      return { error: "Failed to load financial data", data: null };
    }

    const tiers = tiersRes.data ?? [];
    const orders = ordersRes.data ?? [];
    const eventArtists = artistsRes.data ?? [];

    // Fetch order lines for the paid orders in a second pass (avoids the placeholder hack)
    let orderLines: Array<{ tier_id: string; quantity: number; subtotal: number; refunded_quantity: number }> = [];
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const { data: linesData, error: linesError } = await admin
        .from("order_lines")
        .select("tier_id, quantity, subtotal, refunded_quantity")
        .in("order_id", orderIds);
      if (linesError) {
        console.error("[getEventFinancials] order_lines error:", linesError.message);
      }
      orderLines = linesData ?? [];
    }

    // Build tier revenue from order_lines (net of refunded quantity)
    // order_lines.subtotal = quantity * unit_price; for refunds we scale proportionally.
    const tierRevenueMap: Record<string, number> = {};
    const tierSoldMap: Record<string, number> = {};
    for (const line of orderLines) {
      const netQty = line.quantity - (line.refunded_quantity ?? 0);
      const unitPrice = line.quantity > 0 ? line.subtotal / line.quantity : 0;
      tierRevenueMap[line.tier_id] = (tierRevenueMap[line.tier_id] ?? 0) + netQty * unitPrice;
      tierSoldMap[line.tier_id] = (tierSoldMap[line.tier_id] ?? 0) + netQty;
    }

    // Build ticket tier rows
    const ticketTiers: TicketTierRow[] = tiers.map((tier) => {
      const revenue = tierRevenueMap[tier.id] ?? 0;
      const sold = tierSoldMap[tier.id] ?? tier.tickets_sold ?? 0;
      return {
        id: tier.id,
        name: tier.name,
        price: Number(tier.price),
        capacity: tier.capacity ?? 0,
        ticketsSold: sold,
        revenue: Math.round(revenue * 100) / 100,
      };
    });

    // expense_expenses has no metadata or currency columns in the new schema.
    // FX fields are always null for these rows.
    const expenses = expensesRes.data ?? [];
    const expenseRows: ExpenseRow[] = expenses.map((e) => ({
      id: e.id,
      description: e.description ?? "",
      category: e.category ?? "other",
      amount: Number(e.amount) || 0,
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
      fxLockedAt: null,
    }));

    // No event_revenue table in new schema — revenue lines are always empty.
    // UI components receive an empty array and render nothing for this section.
    const revenueLineRows: RevenueLineRow[] = [];

    // Artist fee rows — name is now a direct column on event_artists
    const artistFeeRows: ArtistFeeRow[] = eventArtists.map((ea) => ({
      id: ea.id,
      artistName: ea.name ?? "Unknown Artist",
      fee: Number(ea.fee) || 0,
    }));

    // Calculate totals from orders (source of truth for revenue)
    const ticketRevenue = orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
    const totalTicketsSold = ticketTiers.reduce((sum, t) => sum + t.ticketsSold, 0);
    const totalExpenses = expenseRows.reduce((sum, e) => sum + e.amount, 0);
    const totalArtistFees = artistFeeRows.reduce((sum, a) => sum + a.fee, 0);

    const commercial = readEventCommercialConfig(event.metadata);
    const estimatedBarRevenue = getProjectedBarRevenue(commercial);
    // additionalRevenue is display-only (projected bar share) — NOT counted in
    // actual P&L since bar revenue is not collected by the collective until wrap.
    const additionalRevenue = estimatedBarRevenue ?? 0;
    const grossRevenue = ticketRevenue; // actual collected revenue only
    const projectedBarSales = commercial.projectedBarSales ?? 0;
    const barMinimum = commercial.barMinimum;
    const barShortfall = barMinimum != null ? Math.max(0, barMinimum - projectedBarSales) : 0;
    const profitLoss = grossRevenue - totalExpenses - totalArtistFees;

    return {
      error: null,
      data: {
        eventId,
        eventTitle: event.title,
        currency: reportingCurrency,
        ticketTiers,
        expenses: expenseRows,
        revenueLines: revenueLineRows,
        artistFees: artistFeeRows,
        ticketRevenue: Math.round(ticketRevenue * 100) / 100,
        additionalRevenue: Math.round(additionalRevenue * 100) / 100,
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        totalTicketsSold,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalArtistFees: Math.round(totalArtistFees * 100) / 100,
        barShortfall: Math.round(barShortfall * 100) / 100,
        profitLoss: Math.round(profitLoss * 100) / 100,
        venueCost: commercial.venueCost,
        venueDeposit: commercial.venueDeposit,
        barMinimum,
        estimatedBarRevenue,
        actualBarRevenue: null,
      },
    };
  } catch (err) {
    console.error("[getEventFinancials]", err);
    return { error: "Something went wrong", data: null };
  }
}

// ── Add Expense ──────────────────────────────────────────────────────

// Canonical + legacy categories — single source of truth in
// `@/lib/expense-categories`
import { ACCEPTED_EXPENSE_CATEGORIES as VALID_EXPENSE_CATEGORIES } from "@/lib/expense-categories";

export async function addExpense(eventId: string, data: { description: string; category: string; amount: number }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };

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
    // event_expenses: event_id, category, description, amount, is_paid, created_by
    const { error } = await admin
      .from("event_expenses")
      .insert({
        event_id: eventId,
        category,
        description: desc,
        amount,
        is_paid: false,
        created_by: user.id,
      });

    if (error) return { error: "Failed to add expense" };

    revalidatePath(`/dashboard/events/${eventId}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[addExpense]", err);
    return { error: "Something went wrong" };
  }
}

// ── Update Expense ───────────────────────────────────────────────────

export async function updateExpense(expenseId: string, data: { description?: string; category?: string; amount?: number }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!expenseId?.trim()) return { error: "Expense ID is required" };

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
    const { data: expense, error: expenseLookupError } = await admin
      .from("event_expenses")
      .select("event_id")
      .eq("id", expenseId)
      .maybeSingle();

    if (expenseLookupError) return { error: "Failed to look up expense" };
    if (!expense) return { error: "Expense not found" };

    const ownership = await verifyOwnership(user.id, expense.event_id);
    if (ownership.error) return { error: ownership.error };

    const updatePayload: Record<string, unknown> = {};
    if (data.description !== undefined) updatePayload.description = data.description.trim();
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.amount !== undefined) updatePayload.amount = Math.round(data.amount * 100) / 100;

    const { error } = await admin
      .from("event_expenses")
      .update(updatePayload)
      .eq("id", expenseId);

    if (error) return { error: "Failed to update expense" };

    revalidatePath(`/dashboard/events/${expense.event_id}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[updateExpense]", err);
    return { error: "Something went wrong" };
  }
}

// ── Delete Expense ───────────────────────────────────────────────────

export async function deleteExpense(expenseId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!expenseId?.trim()) return { error: "Expense ID is required" };

    const admin = createAdminClient();

    const { data: expense, error: expenseLookupError } = await admin
      .from("event_expenses")
      .select("event_id")
      .eq("id", expenseId)
      .maybeSingle();

    if (expenseLookupError) return { error: "Failed to look up expense" };
    if (!expense) return { error: "Expense not found" };

    const ownership = await verifyOwnership(user.id, expense.event_id);
    if (ownership.error) return { error: ownership.error };

    const { error } = await admin
      .from("event_expenses")
      .delete()
      .eq("id", expenseId);

    if (error) return { error: "Failed to delete expense" };

    revalidatePath(`/dashboard/events/${expense.event_id}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[deleteExpense]", err);
    return { error: "Something went wrong" };
  }
}

// ── Revenue Line CRUD ───────────────────────────────────────────────
// The event_revenue table was removed in the schema rebuild.
// These stubs return errors gracefully so existing UI components
// don't crash — they will show an empty list and disabled add button.

export async function addRevenueLine(_eventId: string, _data: { description: string; category: string; amount: number }) {
  return { error: "Custom revenue lines are not supported in the current schema." };
}

export async function updateRevenueLine(_revenueId: string, _data: { description?: string; category?: string; amount?: number }) {
  return { error: "Custom revenue lines are not supported in the current schema." };
}

export async function deleteRevenueLine(_revenueId: string) {
  return { error: "Custom revenue lines are not supported in the current schema." };
}

// ── Bar Settings ────────────────────────────────────────────────────
// The bar_minimum and actual_bar_revenue columns were removed from events
// in the schema rebuild. This stub is kept for API compatibility.

export async function updateEventBarSettings(
  _eventId: string,
  _data: { barMinimum?: number | null; actualBarRevenue?: number | null }
) {
  return { error: "Bar settings are not supported in the current schema." };
}
