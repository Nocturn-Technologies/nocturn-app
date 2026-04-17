"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { convertBetween } from "@/lib/currency";

// ─── Expense categories ─────────────────────────────────────────────────────
// Organizers think about expenses in buckets, not a flat list. These categories
// drive the UI (chip-add for production/marketing) and the suggested-expense
// auto-fill for international headliners (flights/hotel/transport/per_diem).
export type ExpenseCategory =
  | "talent"
  | "flights"
  | "hotel"
  | "transport"
  | "per_diem"
  | "venue_rental"
  | "bar_minimum"
  | "deposit"
  | "ads"
  | "graphic_design"
  | "photo"
  | "video"
  | "other";

export interface ExpenseItem {
  category: ExpenseCategory;
  label: string;      // human-readable, e.g. "Talent fee" or "Flyer designer"
  amount: number;     // in the item's native currency, whole units (not cents)
  currency: string;   // ISO 4217 lowercase, e.g. "usd"
}

/**
 * Snapshot of an ExpenseItem after server-side FX conversion into the event's
 * reporting currency. The `local_*` fields are what feed the P&L / break-even.
 */
export interface ExpenseItemResolved extends ExpenseItem {
  local_amount: number; // converted to event_currency at entry time
  local_currency: string;
  fx_rate: number;      // rate from `currency` → `local_currency`
  fx_locked_at: string; // ISO 8601
}

export interface BudgetInput {
  // Event-level currency. All totals and break-even math use this unit.
  // Caller passes this in; the client resolves it from event override →
  // collective default → "usd".
  eventCurrency: string;

  // Headliner context (drives travel auto-suggest)
  headlinerType: "local" | "international" | "none";
  headlinerOrigin?: string;
  stayNights?: number;

  // Itemized expenses in their native currencies.
  items: ExpenseItem[];

  // Bar minimum is a revenue threshold, not an expense. Kept separate so the
  // planner can flag deposit-at-risk without double-counting.
  barMinimum?: number;

  // Used to cap break-even math and auto-suggest flights/hotel per city.
  venueCity?: string;
  venueCapacity?: number;

  date?: string;
}

export interface TravelSuggestion {
  flights: number;
  hotel: number;
  transport: number;
  perDiem: number;
  currency: string; // the suggestion is always denominated in the event currency
  breakdown: string;
}

export interface BudgetResult {
  eventCurrency: string;
  totalExpenses: number;           // grand total in eventCurrency
  resolvedItems: ExpenseItemResolved[];
  suggestedTiers: Array<{
    name: string;
    price: number;
    capacity: number;
    reasoning: string;
  }>;
  breakEven: { ticketsNeeded: number; atPrice: number };
  scenarios: Array<{ label: string; soldPct: number; revenue: number; profit: number }>;
  summary: string;
}

// ─── Travel estimates (unchanged logic, denominated in USD then converted) ──
function estimateFlightCostUSD(origin: string): number {
  const lower = origin.toLowerCase();
  if (["new york", "nyc", "la", "los angeles", "miami", "chicago", "detroit", "atlanta", "montreal", "vancouver"].some(c => lower.includes(c))) return 350;
  if (["us", "usa", "united states", "canada"].some(c => lower.includes(c))) return 400;
  if (["uk", "london", "berlin", "amsterdam", "paris", "ibiza", "spain", "france", "germany", "netherlands", "europe", "italy", "barcelona"].some(c => lower.includes(c))) return 900;
  if (["australia", "sydney", "melbourne", "japan", "tokyo", "korea", "seoul", "asia"].some(c => lower.includes(c))) return 1400;
  if (["brazil", "colombia", "argentina", "mexico", "south america", "latin america"].some(c => lower.includes(c))) return 700;
  if (["south africa", "nigeria", "africa"].some(c => lower.includes(c))) return 1200;
  return 800;
}

function estimateHotelPerNightUSD(city: string): number {
  const lower = city.toLowerCase();
  if (["toronto", "new york", "nyc", "la", "los angeles", "miami", "london", "paris"].some(c => lower.includes(c))) return 200;
  if (["montreal", "vancouver", "chicago", "berlin", "amsterdam"].some(c => lower.includes(c))) return 160;
  return 130;
}

/**
 * Pure travel-suggestion helper: estimate flights/hotel/transport/per-diem in
 * USD, then convert to the event's currency at today's rate. Caller decides
 * whether to populate these as ExpenseItems (client auto-fill) or display as
 * a non-binding hint.
 */
export async function suggestTravel(input: {
  headlinerOrigin: string;
  venueCity: string;
  stayNights?: number;
  eventCurrency: string;
}): Promise<TravelSuggestion> {
  const nights = input.stayNights ?? 2;
  const flightsUSD = estimateFlightCostUSD(input.headlinerOrigin);
  const hotelPerNightUSD = estimateHotelPerNightUSD(input.venueCity);
  const hotelUSD = hotelPerNightUSD * nights;
  const transportUSD = 150;
  const perDiemUSD = 75 * nights;

  const target = input.eventCurrency.toLowerCase();
  const [flights, hotel, transport, perDiem] = await Promise.all([
    convertBetween(flightsUSD, "usd", target),
    convertBetween(hotelUSD, "usd", target),
    convertBetween(transportUSD, "usd", target),
    convertBetween(perDiemUSD, "usd", target),
  ]);

  return {
    flights: Math.round(flights.amount),
    hotel: Math.round(hotel.amount),
    transport: Math.round(transport.amount),
    perDiem: Math.round(perDiem.amount),
    currency: target,
    breakdown: `Flights from ${input.headlinerOrigin} · Hotel (${nights} nights × ~$${hotelPerNightUSD} USD/night) · Transport · Per diem (${nights} nights × $75 USD/day) — converted to ${target.toUpperCase()}`,
  };
}

// ─── Main entry point ───────────────────────────────────────────────────────
export async function calculateBudget(input: BudgetInput): Promise<BudgetResult> {
  const eventCurrency = (input.eventCurrency || "usd").toLowerCase();
  const emptyResult: BudgetResult = {
    eventCurrency,
    totalExpenses: 0,
    resolvedItems: [],
    suggestedTiers: [],
    breakEven: { ticketsNeeded: 0, atPrice: 0 },
    scenarios: [],
    summary: "Something went wrong",
  };

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ...emptyResult, summary: "Not authenticated" };

    if (input.venueCapacity !== undefined && (input.venueCapacity < 1 || input.venueCapacity > 100000)) {
      return { ...emptyResult, summary: "Venue capacity must be between 1 and 100,000" };
    }

    // Validate amounts upfront so a malformed row doesn't get silently summed as 0.
    for (const it of input.items) {
      if (!Number.isFinite(it.amount) || it.amount < 0 || it.amount > 10_000_000) {
        return { ...emptyResult, summary: `Invalid amount on "${it.label}"` };
      }
      if (!/^[a-z]{3}$/.test(it.currency.toLowerCase())) {
        return { ...emptyResult, summary: `Invalid currency code "${it.currency}"` };
      }
    }

    // Convert every line to the event's currency in parallel. One snapshot
    // timestamp for the whole calculation so the P&L math is internally
    // consistent even if rates update mid-flight.
    const fxLockedAt = new Date().toISOString();
    const resolvedItems: ExpenseItemResolved[] = await Promise.all(
      input.items.map(async (it) => {
        const { amount: local_amount, rate } = await convertBetween(
          it.amount,
          it.currency,
          eventCurrency,
        );
        return {
          ...it,
          currency: it.currency.toLowerCase(),
          local_amount,
          local_currency: eventCurrency,
          fx_rate: rate,
          fx_locked_at: fxLockedAt,
        };
      }),
    );

    const totalExpenses = resolvedItems.reduce((s, it) => s + it.local_amount, 0);
    const capacity = input.venueCapacity ?? 200;

    // Organizer keeps 100% of ticket price — buyer pays Nocturn's 7%+$0.50
    // at checkout and Nocturn absorbs Stripe. No fee gross-up here.
    const targetTickets = Math.round(capacity * 0.75);
    const breakEvenPrice = targetTickets > 0 ? Math.ceil(totalExpenses / targetTickets) : 0;

    // Round marketed prices up to the nearest $5 (flat numbers promote better).
    const roundUpToFive = (n: number) => Math.ceil(n / 5) * 5;
    const gaPriceRaw = Math.max(breakEvenPrice, 15);
    const tier1Price = roundUpToFive(gaPriceRaw);
    const tier2Price = roundUpToFive(tier1Price * 1.25);
    const tier3Price = roundUpToFive(tier1Price * 1.5);
    const earlyBirdRounded = Math.round((tier1Price * 0.75) / 5) * 5;
    const earlyBirdPrice = Math.max(Math.min(earlyBirdRounded, tier1Price - 5), 5);

    const suggestedTiers = [
      { name: "Early Bird",  price: earlyBirdPrice, capacity: Math.round(capacity * 0.15), reasoning: "Limited release at a discount to build early momentum and social proof" },
      { name: "Tier 1",      price: tier1Price,     capacity: Math.round(capacity * 0.35), reasoning: `Main release — priced to cover costs at 75% sell-through (${breakEvenPrice} ${eventCurrency.toUpperCase()} break-even)` },
      { name: "Tier 2",      price: tier2Price,     capacity: Math.round(capacity * 0.30), reasoning: "Price bump for later buyers — 25% above Tier 1" },
      { name: "Tier 3",      price: tier3Price,     capacity: Math.round(capacity * 0.20), reasoning: "Final release / door price — 50% above Tier 1 for maximum margin" },
    ];

    const calcScenario = (soldPct: number) => {
      let revenue = 0;
      for (const tier of suggestedTiers) revenue += Math.round(tier.capacity * soldPct) * tier.price;
      return { revenue, profit: revenue - totalExpenses };
    };
    const scenarios = [
      { label: "50% sold", soldPct: 0.5 },
      { label: "75% sold", soldPct: 0.75 },
      { label: "Sell-out", soldPct: 1.0 },
    ].map(s => ({ ...s, ...calcScenario(s.soldPct) }));

    const barMinimum = input.barMinimum ?? 0;
    const deposit = resolvedItems.find(i => i.category === "deposit")?.local_amount ?? 0;

    const profitAt75 = scenarios[1].profit;
    const summary = profitAt75 >= 0
      ? `Total expenses: ${totalExpenses.toLocaleString()} ${eventCurrency.toUpperCase()}. At 75% capacity you'd make ${profitAt75.toLocaleString()} ${eventCurrency.toUpperCase()} profit.${barMinimum > 0 ? ` Bar minimum of ${barMinimum.toLocaleString()}${deposit > 0 ? ` — if you don't hit it, you lose your ${deposit.toLocaleString()} deposit.` : "."}` : ""}`
      : `Total expenses: ${totalExpenses.toLocaleString()} ${eventCurrency.toUpperCase()}. You'd need to sell ${Math.ceil(capacity * 0.75)} tickets at ${tier1Price} ${eventCurrency.toUpperCase()} to break even.${barMinimum > 0 ? ` Bar minimum of ${barMinimum.toLocaleString()} adds risk.` : ""} Consider reducing costs or raising ticket prices.`;

    return {
      eventCurrency,
      totalExpenses,
      resolvedItems,
      suggestedTiers,
      breakEven: { ticketsNeeded: targetTickets, atPrice: breakEvenPrice },
      scenarios,
      summary,
    };
  } catch (err) {
    console.error("[calculateBudget]", err);
    return emptyResult;
  }
}
