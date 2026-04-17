"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/config";
import { revalidatePath } from "next/cache";

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
  // `amount` is always in the event's reporting currency (what the P&L sums).
  amount: number;
  // FX snapshot from when the row was entered (populated by the wizard and
  // edit form). When present + originalCurrency differs from the event
  // currency, the P&L renders "3500 USD @ 1.38" alongside the converted
  // amount so operators can tie it back to their bank statement / DJ invoice.
  // Null for rows added before multi-currency support (legacy) or manually
  // added post-event without currency metadata.
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
  id: string;           // event_artists composite id
  artistName: string;
  fee: number;
}

export interface EventFinancials {
  eventId: string;
  eventTitle: string;
  /**
   * ISO 4217 lowercase (e.g. "usd", "cad"). Resolved as:
   * event.currency → collective.default_currency → "usd".
   * Consumer UIs should format amounts in this currency — they used to
   * hardcode USD which misled operators whose event was denominated in CAD.
   */
  currency: string;
  ticketTiers: TicketTierRow[];
  expenses: ExpenseRow[];
  revenueLines: RevenueLineRow[];
  artistFees: ArtistFeeRow[];
  // Calculated totals
  // Note: Stripe + Nocturn fees are NOT in this view. Buyers pay them at
  // checkout (the buyer fee on top of face value covers both), so the
  // organizer keeps 100% of grossRevenue. Showing those line items here
  // confused promoters into thinking the fees came out of their pocket.
  ticketRevenue: number;
  additionalRevenue: number;
  grossRevenue: number;
  totalTicketsSold: number;
  totalExpenses: number;
  totalArtistFees: number;
  // Bar minimum shortfall: amount the organizer owes the venue when actual
  // bar sales fall under the contracted minimum (max(0, barMinimum - actual)).
  // 0 if there's no minimum or it was met.
  barShortfall: number;
  profitLoss: number;
  // Event-level financial fields
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
    .select("id, collective_id, title, venue_cost, venue_deposit, bar_minimum, estimated_bar_revenue, actual_bar_revenue, currency")
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

    // Resolve the event's reporting currency: per-event override → collective
    // default → "usd". Consumers format amounts in this unit so a CAD event
    // doesn't render as "$" (ambiguous USD).
    let reportingCurrency = (event.currency ?? "").toLowerCase();
    if (!reportingCurrency) {
      const { data: collective } = await admin
        .from("collectives")
        .select("default_currency")
        .eq("id", event.collective_id)
        .maybeSingle();
      reportingCurrency = (collective?.default_currency ?? "usd").toLowerCase();
    }

    // Parallel queries
    const [tiersRes, ticketsRes, expensesRes, revenueRes, artistsRes] = await Promise.all([
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
        .select("id, description, category, amount, metadata")
        .eq("event_id", eventId)
        .order("created_at"),
      admin
        .from("event_revenue")
        .select("id, description, category, amount")
        .eq("event_id", eventId)
        .order("created_at"),
      admin
        .from("event_artists")
        .select("event_id, artist_id, fee, artists(name)")
        .eq("event_id", eventId),
    ]);

    if (tiersRes.error || ticketsRes.error || expensesRes.error || revenueRes.error || artistsRes.error) {
      console.error("[getEventFinancials]", tiersRes.error || ticketsRes.error || expensesRes.error || revenueRes.error || artistsRes.error);
      return { error: "Failed to load financial data", data: null };
    }

    const tiers = tiersRes.data ?? [];
    const tickets = ticketsRes.data ?? [];
    const revenueLinesData = revenueRes.data ?? [];
    const eventArtists = artistsRes.data ?? [];
    // Filter expenses to prevent double-counts.
    //   - venue_rental + deposit are always excluded — authoritative on
    //     events.venue_cost / events.venue_deposit columns.
    //   - talent + flights + hotel + transport + per_diem are excluded
    //     ONLY when event_artists has recorded fees, because the wizard
    //     writes headliner costs as expense rows AND the lineup step
    //     writes them to event_artists. Subtracting both is the old bug.
    //     If an operator only tracks talent via the wizard (never uses
    //     the lineup step), we still count those rows.
    const VENUE_CATEGORIES = new Set(["venue_rental", "deposit"]);
    const HEADLINER_CATEGORIES = new Set(["talent", "flights", "hotel", "transport", "per_diem"]);
    const hasEventArtists = eventArtists.length > 0;
    const expenses = (expensesRes.data ?? []).filter((e) => {
      const cat = e.category ?? "";
      if (VENUE_CATEGORIES.has(cat)) return false;
      if (hasEventArtists && HEADLINER_CATEGORIES.has(cat)) return false;
      return true;
    });

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

    // Build expense rows. Pull FX snapshot out of metadata so the P&L can
    // render "Original: 3500 USD @ 1.38" next to the converted amount for any
    // rows whose native currency differs from the event's reporting currency.
    const expenseRows: ExpenseRow[] = expenses.map((e) => {
      const meta = (e.metadata ?? {}) as {
        original_amount?: number;
        original_currency?: string;
        fx_rate?: number;
        fx_locked_at?: string;
      };
      return {
        id: e.id,
        description: e.description ?? "",
        category: e.category ?? "other",
        amount: Number(e.amount) || 0,
        originalAmount: typeof meta.original_amount === "number" ? meta.original_amount : null,
        originalCurrency: typeof meta.original_currency === "string" ? meta.original_currency : null,
        fxRate: typeof meta.fx_rate === "number" ? meta.fx_rate : null,
        fxLockedAt: typeof meta.fx_locked_at === "string" ? meta.fx_locked_at : null,
      };
    });

    // Build revenue line rows
    const revenueLineRows: RevenueLineRow[] = revenueLinesData.map((r) => ({
      id: r.id,
      description: r.description ?? "",
      category: r.category ?? "other",
      amount: Number(r.amount) || 0,
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
    const ticketRevenue = ticketTiers.reduce((sum, t) => sum + t.revenue, 0);
    const additionalRevenue = revenueLineRows.reduce((sum, r) => sum + r.amount, 0);
    const grossRevenue = ticketRevenue + additionalRevenue;
    const totalTicketsSold = ticketTiers.reduce((sum, t) => sum + t.ticketsSold, 0);
    const totalExpenses = expenseRows.reduce((sum, e) => sum + e.amount, 0);
    const totalArtistFees = artistFeeRows.reduce((sum, a) => sum + a.fee, 0);

    // Stripe + Nocturn fees are buyer-paid — Nocturn is the merchant of
    // record, so neither comes out of the organizer's pocket. The P&L here
    // is purely from the organizer's perspective: revenue is the full
    // ticket face value, expenses are the costs they actually write checks
    // for (artists, venue, gear, promo, etc.).
    const venueCostNum = event.venue_cost ? Number(event.venue_cost) : 0;
    const venueDepositNum = event.venue_deposit ? Number(event.venue_deposit) : 0;

    // Bar minimum shortfall: if venue requires a $X bar minimum and actual
    // sales fell short, the organizer eats the difference. Only counts when
    // both barMinimum and actualBarRevenue are set — if actual isn't filled
    // in yet (event hasn't happened, or organizer hasn't reconciled), we
    // can't compute a real shortfall, so it's $0.
    const barMin = event.bar_minimum ? Number(event.bar_minimum) : 0;
    const actualBar = event.actual_bar_revenue != null ? Number(event.actual_bar_revenue) : null;
    const barShortfall =
      barMin > 0 && actualBar != null && actualBar < barMin
        ? Math.round((barMin - actualBar) * 100) / 100
        : 0;

    const profitLoss =
      grossRevenue -
      totalExpenses -
      totalArtistFees -
      venueCostNum -
      venueDepositNum -
      barShortfall;

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
        barShortfall,
        profitLoss: Math.round(profitLoss * 100) / 100,
        venueCost: event.venue_cost ? Number(event.venue_cost) : null,
        venueDeposit: event.venue_deposit ? Number(event.venue_deposit) : null,
        barMinimum: event.bar_minimum ? Number(event.bar_minimum) : null,
        estimatedBarRevenue: event.estimated_bar_revenue ? Number(event.estimated_bar_revenue) : null,
        actualBarRevenue: actualBar,
      },
    };
  } catch (err) {
    console.error("[getEventFinancials]", err);
    return { error: "Something went wrong", data: null };
  }
}

// ── Add Expense ──────────────────────────────────────────────────────

const VALID_EXPENSE_CATEGORIES = [
  "talent", "venue", "production", "sound", "lighting",
  "staffing", "security", "marketing", "hospitality",
  "transportation", "equipment", "decor", "insurance",
  "permits", "booking_fee",
  // Legacy values still accepted for backward compat
  "dj", "artist", "promotion", "staff", "miscellaneous",
  "other",
];

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
    const { error } = await admin
      .from("expenses")
      .insert({
        event_id: eventId,
        collective_id: ownership.collectiveId!,
        description: desc,
        category,
        amount,
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
      .from("expenses")
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
      .from("expenses")
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
      .from("expenses")
      .select("event_id")
      .eq("id", expenseId)
      .maybeSingle();

    if (expenseLookupError) return { error: "Failed to look up expense" };
    if (!expense) return { error: "Expense not found" };

    const ownership = await verifyOwnership(user.id, expense.event_id);
    if (ownership.error) return { error: ownership.error };

    const { error } = await admin
      .from("expenses")
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
// Custom revenue lines (bar revenue, sponsorship, merch, coat check, etc.)
// Mirrors the expense CRUD pattern. Categories are free-form on the
// server — the UI presents a fixed set but we don't reject unknown ones,
// so promoters can dump anything in.

const VALID_REVENUE_CATEGORIES = [
  "bar", "sponsorship", "merch", "coat_check", "donation", "other",
];

export async function addRevenueLine(eventId: string, data: { description: string; category: string; amount: number }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };

    const desc = (data.description ?? "").trim();
    if (!desc) return { error: "Description is required." };
    if (desc.length > 500) return { error: "Description must be under 500 characters." };
    if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Amount must be a positive number." };
    if (data.amount > 9999999.99) return { error: "Amount is too large." };
    const category = VALID_REVENUE_CATEGORIES.includes(data.category) ? data.category : "other";
    const amount = Math.round(data.amount * 100) / 100;

    const ownership = await verifyOwnership(user.id, eventId);
    if (ownership.error) return { error: ownership.error };

    const admin = createAdminClient();
    const { error } = await admin
      .from("event_revenue")
      .insert({
        event_id: eventId,
        collective_id: ownership.collectiveId!,
        description: desc,
        category,
        amount,
      });

    if (error) {
      console.error("[addRevenueLine]", error.message);
      return { error: "Failed to add revenue line" };
    }

    revalidatePath(`/dashboard/events/${eventId}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[addRevenueLine]", err);
    return { error: "Something went wrong" };
  }
}

export async function updateRevenueLine(revenueId: string, data: { description?: string; category?: string; amount?: number }) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!revenueId?.trim()) return { error: "Revenue line ID is required" };

    if (data.description !== undefined) {
      const desc = data.description.trim();
      if (!desc) return { error: "Description is required." };
      if (desc.length > 500) return { error: "Description must be under 500 characters." };
    }
    if (data.amount !== undefined) {
      if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Amount must be a positive number." };
      if (data.amount > 9999999.99) return { error: "Amount is too large." };
    }
    if (data.category !== undefined && !VALID_REVENUE_CATEGORIES.includes(data.category)) {
      data.category = "other";
    }

    const admin = createAdminClient();
    const { data: row, error: lookupError } = await admin
      .from("event_revenue")
      .select("event_id")
      .eq("id", revenueId)
      .maybeSingle();

    if (lookupError) return { error: "Failed to look up revenue line" };
    if (!row) return { error: "Revenue line not found" };

    const ownership = await verifyOwnership(user.id, row.event_id);
    if (ownership.error) return { error: ownership.error };

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.description !== undefined) updatePayload.description = data.description.trim();
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.amount !== undefined) updatePayload.amount = Math.round(data.amount * 100) / 100;

    const { error } = await admin
      .from("event_revenue")
      .update(updatePayload)
      .eq("id", revenueId);

    if (error) return { error: "Failed to update revenue line" };

    revalidatePath(`/dashboard/events/${row.event_id}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[updateRevenueLine]", err);
    return { error: "Something went wrong" };
  }
}

export async function deleteRevenueLine(revenueId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!revenueId?.trim()) return { error: "Revenue line ID is required" };

    const admin = createAdminClient();
    const { data: row, error: lookupError } = await admin
      .from("event_revenue")
      .select("event_id")
      .eq("id", revenueId)
      .maybeSingle();

    if (lookupError) return { error: "Failed to look up revenue line" };
    if (!row) return { error: "Revenue line not found" };

    const ownership = await verifyOwnership(user.id, row.event_id);
    if (ownership.error) return { error: ownership.error };

    const { error } = await admin
      .from("event_revenue")
      .delete()
      .eq("id", revenueId);

    if (error) return { error: "Failed to delete revenue line" };

    revalidatePath(`/dashboard/events/${row.event_id}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[deleteRevenueLine]", err);
    return { error: "Something went wrong" };
  }
}

// ── Bar Settings ────────────────────────────────────────────────────
// Update bar minimum and/or actual bar revenue. Both are optional — pass
// null to clear, undefined to leave unchanged. The shortfall is computed
// on read in getEventFinancials, not stored.

export async function updateEventBarSettings(
  eventId: string,
  data: { barMinimum?: number | null; actualBarRevenue?: number | null }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    if (!eventId?.trim()) return { error: "Event ID is required" };

    const ownership = await verifyOwnership(user.id, eventId);
    if (ownership.error) return { error: ownership.error };

    function safeMoney(n: number | null | undefined): number | null | undefined {
      if (n === undefined) return undefined; // leave unchanged
      if (n === null) return null;
      if (!Number.isFinite(n) || n < 0 || n > 9999999.99) return undefined;
      return Math.round(n * 100) / 100;
    }

    const updatePayload: Record<string, unknown> = {};
    const barMin = safeMoney(data.barMinimum);
    const actualBar = safeMoney(data.actualBarRevenue);
    if (barMin !== undefined) updatePayload.bar_minimum = barMin;
    if (actualBar !== undefined) updatePayload.actual_bar_revenue = actualBar;

    if (Object.keys(updatePayload).length === 0) return { error: null };

    const admin = createAdminClient();
    const { error } = await admin
      .from("events")
      .update(updatePayload)
      .eq("id", eventId);

    if (error) {
      console.error("[updateEventBarSettings]", error.message);
      return { error: "Failed to update bar settings" };
    }

    revalidatePath(`/dashboard/events/${eventId}/financials`);
    return { error: null };
  } catch (err) {
    console.error("[updateEventBarSettings]", err);
    return { error: "Something went wrong" };
  }
}
