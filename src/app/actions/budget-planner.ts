"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { convertBetween } from "@/lib/currency";
import { cascadeScenario, cascadeBreakEven } from "@/lib/ticket-forecast";
// Expense category union — canonical source is `src/lib/expense-categories.ts`
// so budget-planner, event-financials, settlements, and the wizard chip tray
// never drift. Re-exported here for callers still importing from this file.
import type { ExpenseCategory } from "@/lib/expense-categories";

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
 *
 * `groupSize` (default 1) covers artist + crew. Multipliers:
 *   - flights: × group (every person needs a seat)
 *   - hotel: × ceil(group / 2) (assume 2 per room)
 *   - transport: single airport pickup, no multiplier
 *   - per diem: × group (every person eats)
 */
export async function suggestTravel(input: {
  headlinerOrigin: string;
  venueCity: string;
  stayNights?: number;
  eventCurrency: string;
  groupSize?: number;
}): Promise<TravelSuggestion> {
  const nights = input.stayNights ?? 2;
  const group = Math.max(1, Math.min(20, Math.floor(input.groupSize ?? 1)));
  const rooms = Math.ceil(group / 2);

  const flightsUSD = estimateFlightCostUSD(input.headlinerOrigin) * group;
  const hotelPerNightUSD = estimateHotelPerNightUSD(input.venueCity);
  const hotelUSD = hotelPerNightUSD * nights * rooms;
  const transportUSD = 150;
  const perDiemUSD = 75 * nights * group;

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
    breakdown: `${group} traveler${group > 1 ? "s" : ""} from ${input.headlinerOrigin} · Hotel (${nights} nights × ${rooms} room${rooms > 1 ? "s" : ""} × ~$${hotelPerNightUSD} USD/night) · Transport · Per diem (${nights} nights × ${group}p × $75 USD) — converted to ${target.toUpperCase()}`,
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

    // Suggested tier structure — capacity allocation is fixed, prices are
    // back-solved below so that cumulative revenue at 75% cascade sell-through
    // covers total expenses. Earlier flat-math version used a single blended
    // break-even price that didn't match the cascade reality (marginal buyer
    // at the 75% threshold is inside Tier 2, not paying the average).
    const tierShape = [
      { name: "Early Bird",  share: 0.15 },
      { name: "Tier 1",      share: 0.35 },
      { name: "Tier 2",      share: 0.30 },
      { name: "Tier 3",      share: 0.20 },
    ];
    const tierCapacities = tierShape.map((t) => Math.round(capacity * t.share));

    // Seed T1 at a price that, combined with EB+T1+partial-T2 at cascade
    // 75% target, covers totalExpenses. Walk the cascade: EB fills first,
    // then T1, then T2 up to 75% of total. Solve for T1 price (with EB
    // priced at 75% of T1 and T2 at 125% of T1, T3 at 150%).
    //
    // target75 tickets = round(capacity * 0.75)
    // EB sells out first (tierCapacities[0])
    // Remaining = target75 - EB capacity
    // If remaining <= T1 capacity: T1 sells `remaining` tickets at T1 price.
    //   Total revenue at 75% = EB_cap * 0.75*T1 + remaining * T1 = T1 * (0.75*EB_cap + remaining)
    //   Solve T1 = expenses / (0.75*EB_cap + remaining)
    // If remaining > T1 capacity: T1 fully, T2 picks up the slack.
    //   Revenue = 0.75*T1*EB_cap + T1*T1_cap + 1.25*T1*(remaining - T1_cap)
    //   = T1 * (0.75*EB_cap + T1_cap + 1.25*(remaining - T1_cap))
    //   Solve T1 = expenses / that denominator.
    const target75 = Math.round(capacity * 0.75);
    const ebCap = tierCapacities[0];
    const t1Cap = tierCapacities[1];
    let t1Denominator: number;
    if (target75 <= ebCap) {
      // All expenses covered by EB alone — rare but possible with tiny expenses + big EB share.
      t1Denominator = 0.75 * target75;
    } else if (target75 - ebCap <= t1Cap) {
      const remaining = target75 - ebCap;
      t1Denominator = 0.75 * ebCap + remaining;
    } else {
      const overflow = target75 - ebCap - t1Cap;
      t1Denominator = 0.75 * ebCap + t1Cap + 1.25 * overflow;
    }
    const tier1PriceRaw = t1Denominator > 0 ? totalExpenses / t1Denominator : 15;

    // Round marketed prices up to the nearest $5 so flyers look clean.
    const roundUpToFive = (n: number) => Math.ceil(n / 5) * 5;
    const tier1Price = Math.max(roundUpToFive(Math.max(tier1PriceRaw, 15)), 15);
    const tier2Price = roundUpToFive(tier1Price * 1.25);
    const tier3Price = roundUpToFive(tier1Price * 1.5);
    const earlyBirdRounded = Math.round((tier1Price * 0.75) / 5) * 5;
    const earlyBirdPrice = Math.max(Math.min(earlyBirdRounded, tier1Price - 5), 5);

    const suggestedTiers = [
      { name: "Early Bird",  price: earlyBirdPrice, capacity: tierCapacities[0], reasoning: "Limited release at a discount to build early momentum and social proof" },
      { name: "Tier 1",      price: tier1Price,     capacity: tierCapacities[1], reasoning: `Main release — priced so cascade sell-through at 75% covers ${totalExpenses.toLocaleString()} ${eventCurrency.toUpperCase()} in expenses` },
      { name: "Tier 2",      price: tier2Price,     capacity: tierCapacities[2], reasoning: "Price bump for later buyers — 25% above Tier 1" },
      { name: "Tier 3",      price: tier3Price,     capacity: tierCapacities[3], reasoning: "Final release / door price — 50% above Tier 1 for maximum margin" },
    ];

    // Cascade scenarios using the shared helper (matches InlinePnL + LiveForecast).
    const scenarios = [
      { label: "50% sold", soldPct: 0.5 },
      { label: "75% sold", soldPct: 0.75 },
      { label: "Sell-out", soldPct: 1.0 },
    ].map((s) => {
      const r = cascadeScenario(
        suggestedTiers.map((t, i) => ({ name: t.name, price: t.price, capacity: t.capacity, sort_order: i })),
        s.soldPct,
      );
      return { label: s.label, soldPct: s.soldPct, revenue: r.revenue, profit: r.revenue - totalExpenses, ticketsSold: r.ticketsSold };
    });

    // Cascade break-even: the actual tier + ticket count at which revenue
    // first covers expenses. More honest than the old flat formula.
    const be = cascadeBreakEven(
      suggestedTiers.map((t, i) => ({ name: t.name, price: t.price, capacity: t.capacity, sort_order: i })),
      totalExpenses,
    );

    const barMinimum = input.barMinimum ?? 0;
    const deposit = resolvedItems.find(i => i.category === "deposit")?.local_amount ?? 0;

    const profitAt75 = scenarios[1].profit;
    const summary = profitAt75 >= 0
      ? `Total expenses: ${totalExpenses.toLocaleString()} ${eventCurrency.toUpperCase()}. At 75% capacity you'd make ${profitAt75.toLocaleString()} ${eventCurrency.toUpperCase()} profit.${barMinimum > 0 ? ` Bar minimum of ${barMinimum.toLocaleString()}${deposit > 0 ? ` — if you don't hit it, you lose your ${deposit.toLocaleString()} deposit.` : "."}` : ""}`
      : `Total expenses: ${totalExpenses.toLocaleString()} ${eventCurrency.toUpperCase()}. You'd need to sell ${be.ticketsNeeded} tickets${be.breakEvenTier ? ` (hits break-even inside ${be.breakEvenTier} at ${be.atPrice} ${eventCurrency.toUpperCase()})` : ""} to cover costs.${barMinimum > 0 ? ` Bar minimum of ${barMinimum.toLocaleString()} adds risk.` : ""} Consider reducing costs or raising ticket prices.`;

    return {
      eventCurrency,
      totalExpenses,
      resolvedItems,
      suggestedTiers,
      breakEven: { ticketsNeeded: be.ticketsNeeded, atPrice: be.atPrice },
      scenarios: scenarios.map((s) => ({ label: s.label, soldPct: s.soldPct, revenue: s.revenue, profit: s.profit })),
      summary,
    };
  } catch (err) {
    console.error("[calculateBudget]", err);
    return emptyResult;
  }
}
