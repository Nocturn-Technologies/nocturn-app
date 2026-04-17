/**
 * Cascade sell-through forecast math.
 *
 * The mental model for a ticketed event: tiers don't sell in parallel —
 * they sell in sort order. Early Bird fills first, then Tier 1, then Tier 2,
 * then the door price. If you hit 50% sell-through of total capacity,
 * that's NOT 50% of every tier — it's Early Bird 100% + whatever spills
 * into the next tier.
 *
 * The old "flat rate across every tier" model inflated revenue forecasts:
 * on a typical 15/35/30/20 tier breakdown, flat math over-forecasts the
 * 50%-sold scenario by ~25%. At the investor pitch, an inflated break-even
 * reveals the seam. Cascade is the correct model.
 *
 * Caveat the user flagged (valid): operators sometimes open the next tier
 * before the current one sells out — time-based tier advancement. For
 * forecasting purposes we ignore that; real sales data from the event
 * will eventually overwrite the forecast anyway.
 */

export interface TicketTierInput {
  name: string;
  price: number;
  capacity: number;
  /** Optional explicit sort order. When absent, tiers sell in the order they appear. */
  sort_order?: number;
}

export interface TierSaleLine {
  name: string;
  sold: number;
  capacity: number;
  revenue: number;
  // Price carried through so callers don't have to join back to the input.
  price: number;
}

export interface ScenarioResult {
  /** The sell-through percentage that was requested (e.g. 0.5, 0.75, 1.0, 1.25). */
  soldPct: number;
  /** Total tickets sold after capping at total capacity. */
  ticketsSold: number;
  /** Total revenue in the tier's native currency (unit agnostic). */
  revenue: number;
  /** Per-tier breakdown. Same order as the sorted input. */
  perTier: TierSaleLine[];
  /**
   * Demand above capacity (soldPct > 1.0). Represents waitlist signal —
   * "this many more people wanted in but we were sold out." 0 when
   * soldPct <= 1.0.
   */
  waitlistCount: number;
  /** Total capacity across all tiers (sum of capacities). */
  totalCapacity: number;
}

function sortedTiers(tiers: TicketTierInput[]): TicketTierInput[] {
  return [...tiers].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Compute a single cascade-sell scenario.
 *
 * @param tiers Input tiers (will be sorted by sort_order if present).
 * @param soldPct Target sell-through as fraction of total capacity. 0.5 = 50%. Values > 1 represent waitlist demand.
 */
export function cascadeScenario(
  tiers: TicketTierInput[],
  soldPct: number,
): ScenarioResult {
  const sorted = sortedTiers(tiers);
  const totalCapacity = sorted.reduce((sum, t) => sum + Math.max(0, t.capacity), 0);

  if (totalCapacity === 0) {
    return {
      soldPct,
      ticketsSold: 0,
      revenue: 0,
      perTier: sorted.map((t) => ({ name: t.name, sold: 0, capacity: t.capacity, revenue: 0, price: t.price })),
      waitlistCount: 0,
      totalCapacity: 0,
    };
  }

  const demanded = Math.round(totalCapacity * Math.max(0, soldPct));
  const actualSales = Math.min(demanded, totalCapacity);
  const waitlistCount = Math.max(0, demanded - actualSales);

  let remaining = actualSales;
  const perTier: TierSaleLine[] = [];
  let revenue = 0;

  for (const tier of sorted) {
    const take = Math.min(remaining, Math.max(0, tier.capacity));
    const tierRevenue = take * Math.max(0, tier.price);
    revenue += tierRevenue;
    perTier.push({
      name: tier.name,
      sold: take,
      capacity: tier.capacity,
      revenue: tierRevenue,
      price: tier.price,
    });
    remaining -= take;
  }

  return { soldPct, ticketsSold: actualSales, revenue, perTier, waitlistCount, totalCapacity };
}

/**
 * Compute multiple scenarios in one pass. Convenience for the typical
 * 50/75/100/125 forecast columns.
 */
export function cascadeScenarios(
  tiers: TicketTierInput[],
  soldPcts: number[],
): ScenarioResult[] {
  return soldPcts.map((pct) => cascadeScenario(tiers, pct));
}

export interface CascadeBreakEven {
  /** Total tickets needed to cover expenses. */
  ticketsNeeded: number;
  /** Name of the tier where break-even lands (buyer pays this price). */
  breakEvenTier: string | null;
  /** Break-even as fraction of total capacity. 1.0 means need sell-out. */
  percentOfCapacity: number;
  /** False when even a sell-out wouldn't cover expenses. */
  achievable: boolean;
  /** The price of the break-even tier (what the marginal buyer pays). */
  atPrice: number;
}

/**
 * Cascade break-even — the exact tier + ticket count at which cumulative
 * revenue covers `totalExpenses`. Walks tiers in sort order. Meaningfully
 * different from the old flat formula on staggered-price events.
 *
 * Example (EB 15@$20, T1 35@$24, T2 30@$32, T3 20@$36, expenses $1500):
 *   - Flat: $1500 / 75 = $20/tix → misleading ("price at 75% sell-through")
 *   - Cascade: EB 300 + 50 of T1 (50*$24=$1200) = $1500 at 65 tickets in T1
 *     → break-even is "65 tickets — within Tier 1 at $24"
 */
export function cascadeBreakEven(
  tiers: TicketTierInput[],
  totalExpenses: number,
): CascadeBreakEven {
  const sorted = sortedTiers(tiers);
  const totalCapacity = sorted.reduce((sum, t) => sum + Math.max(0, t.capacity), 0);

  if (totalExpenses <= 0) {
    return {
      ticketsNeeded: 0,
      breakEvenTier: sorted[0]?.name ?? null,
      percentOfCapacity: 0,
      achievable: true,
      atPrice: sorted[0]?.price ?? 0,
    };
  }

  let cumRevenue = 0;
  let cumTickets = 0;
  for (const tier of sorted) {
    const tierMaxRevenue = Math.max(0, tier.capacity) * Math.max(0, tier.price);
    if (cumRevenue + tierMaxRevenue >= totalExpenses) {
      const remaining = totalExpenses - cumRevenue;
      const price = Math.max(0.01, tier.price); // guard div-by-zero on free tiers
      const ticketsInTier = Math.ceil(remaining / price);
      const totalNeeded = cumTickets + ticketsInTier;
      return {
        ticketsNeeded: totalNeeded,
        breakEvenTier: tier.name,
        percentOfCapacity: totalCapacity > 0 ? Math.min(1, totalNeeded / totalCapacity) : 1,
        achievable: true,
        atPrice: tier.price,
      };
    }
    cumRevenue += tierMaxRevenue;
    cumTickets += Math.max(0, tier.capacity);
  }

  // Even a full sell-out doesn't cover expenses.
  return {
    ticketsNeeded: totalCapacity,
    breakEvenTier: null,
    percentOfCapacity: 1,
    achievable: false,
    atPrice: sorted.length > 0 ? sorted[sorted.length - 1].price : 0,
  };
}

/**
 * Format a ScenarioResult's sold-pct label for display. Caps at 100% for
 * cascade-capped values and adds a "+N waitlist" suffix when there was
 * excess demand.
 */
export function scenarioLabel(result: ScenarioResult): string {
  const pctLabel =
    result.soldPct > 1
      ? "Sold out"
      : result.soldPct === 1
        ? "Sell-out"
        : `${Math.round(result.soldPct * 100)}%`;
  return result.waitlistCount > 0 ? `${pctLabel} +${result.waitlistCount}` : pctLabel;
}
