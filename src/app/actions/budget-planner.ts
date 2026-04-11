"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { PLATFORM_FEE_PERCENT, PLATFORM_FEE_FLAT_CENTS } from "@/lib/pricing";

export interface BudgetInput {
  headlinerType: "local" | "international" | "none";
  headlinerOrigin?: string; // e.g. "London, UK" or "New York"
  talentFee?: number;
  venueCost?: number; // room rental
  barMinimum?: number;
  deposit?: number;
  otherExpenses?: number; // sound, lights, security, promo
  venueCity?: string;
  venueCapacity?: number;
  date?: string;
  stayNights?: number; // how many nights the artist is staying
}

export interface TravelEstimate {
  flights: number;
  hotel: number;
  transport: number;
  perDiem: number;
  total: number;
  breakdown: string;
}

export interface BudgetResult {
  totalExpenses: number;
  travelEstimate: TravelEstimate | null;
  suggestedTiers: Array<{
    name: string;
    price: number;
    capacity: number;
    reasoning: string;
  }>;
  breakEven: {
    ticketsNeeded: number;
    atPrice: number;
  };
  scenarios: Array<{
    label: string;
    soldPct: number;
    revenue: number;
    profit: number;
  }>;
  summary: string;
}

// Rough flight cost estimates by region
function estimateFlightCost(origin: string): number {
  const lower = origin.toLowerCase();

  // North America domestic
  if (["new york", "nyc", "la", "los angeles", "miami", "chicago", "detroit", "atlanta", "montreal", "vancouver"].some(c => lower.includes(c))) {
    return 350;
  }
  // US/Canada general
  if (["us", "usa", "united states", "canada"].some(c => lower.includes(c))) {
    return 400;
  }
  // UK/Europe
  if (["uk", "london", "berlin", "amsterdam", "paris", "ibiza", "spain", "france", "germany", "netherlands", "europe", "italy", "barcelona"].some(c => lower.includes(c))) {
    return 900;
  }
  // Australia/Asia
  if (["australia", "sydney", "melbourne", "japan", "tokyo", "korea", "seoul", "asia"].some(c => lower.includes(c))) {
    return 1400;
  }
  // South America
  if (["brazil", "colombia", "argentina", "mexico", "south america", "latin america"].some(c => lower.includes(c))) {
    return 700;
  }
  // Africa
  if (["south africa", "nigeria", "africa"].some(c => lower.includes(c))) {
    return 1200;
  }

  // Default — assume international
  return 800;
}

function estimateHotelPerNight(city: string): number {
  const lower = city.toLowerCase();
  if (["toronto", "new york", "nyc", "la", "los angeles", "miami", "london", "paris"].some(c => lower.includes(c))) {
    return 200; // premium city
  }
  if (["montreal", "vancouver", "chicago", "berlin", "amsterdam"].some(c => lower.includes(c))) {
    return 160;
  }
  return 130; // default
}

export async function calculateBudget(input: BudgetInput): Promise<BudgetResult> {
  const emptyResult: BudgetResult = { totalExpenses: 0, travelEstimate: null, suggestedTiers: [], breakEven: { ticketsNeeded: 0, atPrice: 0 }, scenarios: [], summary: "Something went wrong" };
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ...emptyResult, summary: "Not authenticated" };

    // Input validation
    if (input.venueCapacity !== undefined && (input.venueCapacity < 1 || input.venueCapacity > 100000)) {
      return { ...emptyResult, summary: "Venue capacity must be between 1 and 100,000" };
    }
    if (input.talentFee !== undefined && input.talentFee < 0) {
      return { ...emptyResult, summary: "Talent fee cannot be negative" };
    }
    if (input.venueCost !== undefined && input.venueCost < 0) {
      return { ...emptyResult, summary: "Venue cost cannot be negative" };
    }

    let travelEstimate: TravelEstimate | null = null;

    if (input.headlinerType === "international" && input.headlinerOrigin) {
      const flights = estimateFlightCost(input.headlinerOrigin);
      const nights = input.stayNights ?? 2;
      const hotelPerNight = estimateHotelPerNight(input.venueCity ?? "toronto");
      const hotel = hotelPerNight * nights;
      const transport = 150; // airport transfers + local
      const perDiem = 75 * nights; // meals etc

      travelEstimate = {
        flights,
        hotel,
        transport,
        perDiem,
        total: flights + hotel + transport + perDiem,
        breakdown: `Flights from ${input.headlinerOrigin}: ~$${flights} • Hotel (${nights} nights × $${hotelPerNight}): ~$${hotel} • Transport: ~$${transport} • Per diem: ~$${perDiem}`,
      };
    }

    const talentFee = input.talentFee ?? 0;
    const venueCost = input.venueCost ?? 0;
    const barMinimum = input.barMinimum ?? 0;
    const deposit = input.deposit ?? 0;
    const otherExpenses = input.otherExpenses ?? 0;
    const travelCost = travelEstimate?.total ?? 0;

    const totalExpenses = talentFee + venueCost + deposit + otherExpenses + travelCost;
    // Bar minimum is a threshold, not a direct expense (but deposit risk if not met)

    const capacity = input.venueCapacity ?? 200;

    // Calculate break-even price
    const PLATFORM_FEE_RATE = PLATFORM_FEE_PERCENT / 100;
    const PLATFORM_FEE_FLAT = PLATFORM_FEE_FLAT_CENTS / 100;
    const STRIPE_FEE_RATE = 0.029;
    const STRIPE_FEE_FLAT = 0.30;

    // Target 75% sell-through for safety
    const targetTickets = Math.round(capacity * 0.75);
    const breakEvenPrice = targetTickets > 0
      ? Math.ceil((totalExpenses / targetTickets + PLATFORM_FEE_FLAT + STRIPE_FEE_FLAT) / (1 - PLATFORM_FEE_RATE - STRIPE_FEE_RATE))
      : 0;

    // Suggest tiers
    // Round all marketed prices UP to the nearest $5 — flat numbers like
    // $25/$30/$40 are easier to promote on flyers and IG stories than
    // odd values like $23 or $37. Break-even stays raw because it's the
    // underlying math, not a price we ever show on a flyer.
    const roundUpToFive = (n: number) => Math.ceil(n / 5) * 5;

    const gaPriceRaw = Math.max(breakEvenPrice, 15); // minimum $15
    const tier1Price = roundUpToFive(gaPriceRaw);
    // Compute bumps off the rounded tier1 so the gaps stay clean ($5/$10).
    const tier2Price = roundUpToFive(tier1Price * 1.25);
    const tier3Price = roundUpToFive(tier1Price * 1.5);
    // Early bird: nearest $5 to 0.75x tier1, but always strictly below
    // tier1 (otherwise the discount vanishes on small numbers like $15).
    const earlyBirdRounded = Math.round((tier1Price * 0.75) / 5) * 5;
    const earlyBirdPrice = Math.max(Math.min(earlyBirdRounded, tier1Price - 5), 5);

    const suggestedTiers: Array<{ name: string; price: number; capacity: number; reasoning: string }> = [];

    // Tiered pricing: Early Bird → Tier 1 → Tier 2 → Tier 3
    // Early Bird gets people in early (limited, cheapest)
    // Tier 1 is the main price
    // Tier 2 is a slight bump for later buyers
    // Tier 3 is door price / last minute

    suggestedTiers.push({
      name: "Early Bird",
      price: earlyBirdPrice,
      capacity: Math.round(capacity * 0.15),
      reasoning: `Limited release at a discount to build early momentum and social proof`,
    });

    suggestedTiers.push({
      name: "Tier 1",
      price: tier1Price,
      capacity: Math.round(capacity * 0.35),
      reasoning: `Main release — priced to cover costs at 75% sell-through ($${breakEvenPrice} break-even)`,
    });

    suggestedTiers.push({
      name: "Tier 2",
      price: tier2Price,
      capacity: Math.round(capacity * 0.30),
      reasoning: `Price bump for later buyers — 25% above Tier 1`,
    });

    suggestedTiers.push({
      name: "Tier 3",
      price: tier3Price,
      capacity: Math.round(capacity * 0.20),
      reasoning: `Final release / door price — 50% above Tier 1 for maximum margin`,
    });

    // Calculate scenarios using suggested tiers
    function calcScenario(soldPct: number) {
      let revenue = 0;
      let ticketsSold = 0;
      for (const tier of suggestedTiers) {
        const sold = Math.round(tier.capacity * soldPct);
        ticketsSold += sold;
        revenue += sold * tier.price;
      }
      // Fees are paid by buyer, so organizer keeps full ticket price
      // But we subtract expenses
      const profit = revenue - totalExpenses;
      return { ticketsSold, revenue, profit };
    }

    const scenarios = [
      { label: "50% sold", soldPct: 0.5, emoji: "😐" },
      { label: "75% sold", soldPct: 0.75, emoji: "🔥" },
      { label: "Sell-out", soldPct: 1.0, emoji: "🚀" },
    ].map(s => {
      const calc = calcScenario(s.soldPct);
      return {
        label: s.label,
        soldPct: s.soldPct,
        revenue: calc.revenue,
        profit: calc.profit,
      };
    });

    // Generate summary
    const profitAt75 = scenarios[1].profit;
    const summary = profitAt75 >= 0
      ? `Total expenses: $${totalExpenses.toLocaleString()}. At 75% capacity you'd make $${profitAt75.toLocaleString()} profit. ${barMinimum > 0 ? `Bar minimum of $${barMinimum.toLocaleString()} — if you don't hit it, you lose your $${deposit.toLocaleString()} deposit.` : ""}`
      : `Total expenses: $${totalExpenses.toLocaleString()}. You'd need to sell ${Math.ceil(capacity * 0.75)} tickets at $${tier1Price} to break even. ${barMinimum > 0 ? `Bar minimum of $${barMinimum.toLocaleString()} adds risk.` : ""} Consider reducing costs or raising ticket prices.`;

    return {
      totalExpenses,
      travelEstimate,
      suggestedTiers,
      breakEven: {
        ticketsNeeded: targetTickets,
        atPrice: breakEvenPrice,
      },
      scenarios,
      summary,
    };
  } catch (err) {
    console.error("[calculateBudget]", err);
    return emptyResult;
  }
}
