/**
 * Ticket Forecast Tests
 *
 * Locks in the budget-math functions the event-creation wizard relies on:
 * - multiplyBudgetTiers: Price sensitivity slider, must snap to $5
 * - cascadeBreakEven: Break-even row on the Recommended Tiers card
 */
import { describe, it, expect } from "vitest";
import {
  multiplyBudgetTiers,
  cascadeBreakEven,
  type TicketTierInput,
} from "@/lib/ticket-forecast";

describe("multiplyBudgetTiers", () => {
  const base = [
    { name: "Early Bird", price: 25, capacity: 41 },
    { name: "Tier 1", price: 35, capacity: 96 },
    { name: "Tier 2", price: 45, capacity: 83 },
    { name: "Tier 3", price: 55, capacity: 55 },
  ];

  it("returns unchanged prices at 1.0x when base prices are $5 multiples", () => {
    const result = multiplyBudgetTiers(base, 1.0);
    expect(result.map((t) => t.price)).toEqual([25, 35, 45, 55]);
  });

  it("snaps every tier to the nearest $5 at 0.85x (regression for CAD 21/30/38/47 bug)", () => {
    const result = multiplyBudgetTiers(base, 0.85);
    // Raw: 21.25, 29.75, 38.25, 46.75 → nearest $5: 20, 30, 40, 45
    expect(result.map((t) => t.price)).toEqual([20, 30, 40, 45]);
  });

  it("snaps to $5 at 1.25x too", () => {
    const result = multiplyBudgetTiers(base, 1.25);
    // Raw: 31.25, 43.75, 56.25, 68.75 → nearest $5: 30, 45, 55, 70
    expect(result.map((t) => t.price)).toEqual([30, 45, 55, 70]);
  });

  it("never produces a negative price", () => {
    const result = multiplyBudgetTiers([{ name: "Weird", price: 10, capacity: 5 }], -2);
    expect(result[0].price).toBeGreaterThanOrEqual(0);
  });

  it("preserves tier name and capacity", () => {
    const result = multiplyBudgetTiers(base, 0.9);
    expect(result.map((t) => ({ name: t.name, capacity: t.capacity }))).toEqual(
      base.map((t) => ({ name: t.name, capacity: t.capacity })),
    );
  });

  it("returns empty array for empty input", () => {
    expect(multiplyBudgetTiers([], 1.0)).toEqual([]);
  });

  it("ignores extra fields on the input shape", () => {
    const input = [{ name: "X", price: 20, capacity: 10, reasoning: "note" }];
    const result = multiplyBudgetTiers(input, 1.0);
    expect(result).toEqual([{ name: "X", price: 20, capacity: 10 }]);
  });
});

describe("cascadeBreakEven (live recompute for Price Sensitivity slider)", () => {
  const tiers: TicketTierInput[] = [
    { name: "Early Bird", price: 20, capacity: 15, sort_order: 0 },
    { name: "Tier 1", price: 24, capacity: 35, sort_order: 1 },
    { name: "Tier 2", price: 32, capacity: 30, sort_order: 2 },
    { name: "Tier 3", price: 36, capacity: 20, sort_order: 3 },
  ];

  it("returns zero tickets when expenses are zero", () => {
    const be = cascadeBreakEven(tiers, 0);
    expect(be.ticketsNeeded).toBe(0);
    expect(be.achievable).toBe(true);
  });

  it("lands in the first tier when expenses are small", () => {
    // EB: 15 * $20 = $300. Expenses $200 → need 10 EB tickets.
    const be = cascadeBreakEven(tiers, 200);
    expect(be.breakEvenTier).toBe("Early Bird");
    expect(be.ticketsNeeded).toBe(10);
    expect(be.atPrice).toBe(20);
    expect(be.achievable).toBe(true);
  });

  it("cascades into Tier 2 when EB + T1 alone can't cover expenses", () => {
    // EB maxes at $300, T1 maxes at $840 → cumulative $1140.
    // Expenses $1500 → need $360 more at $32 → ceil(360/32) = 12 T2 tickets.
    // Total: 15 EB + 35 T1 + 12 T2 = 62 tickets inside T2 at $32.
    const be = cascadeBreakEven(tiers, 1500);
    expect(be.breakEvenTier).toBe("Tier 2");
    expect(be.atPrice).toBe(32);
    expect(be.ticketsNeeded).toBe(62);
  });

  it("reports unachievable when even sell-out can't cover expenses", () => {
    // Max revenue: 15*20 + 35*24 + 30*32 + 20*36 = 300+840+960+720 = 2820
    const be = cascadeBreakEven(tiers, 5000);
    expect(be.achievable).toBe(false);
    expect(be.breakEvenTier).toBeNull();
    expect(be.percentOfCapacity).toBe(1);
  });

  it("tracks when the slider raises prices (fewer tickets needed)", () => {
    // Simulate what PricingSection does: multiply the tiers by 1.2x via $5-snap,
    // then recompute break-even. Higher prices → fewer tickets to break-even.
    const louder = multiplyBudgetTiers(tiers, 1.2);
    const louderWithOrder = louder.map((t, i) => ({ ...t, sort_order: i }));
    const baseBE = cascadeBreakEven(tiers, 1500);
    const louderBE = cascadeBreakEven(louderWithOrder, 1500);
    expect(louderBE.ticketsNeeded).toBeLessThan(baseBE.ticketsNeeded);
  });

  it("tracks when the slider lowers prices (more tickets needed)", () => {
    const softer = multiplyBudgetTiers(tiers, 0.8);
    const softerWithOrder = softer.map((t, i) => ({ ...t, sort_order: i }));
    const baseBE = cascadeBreakEven(tiers, 1500);
    const softerBE = cascadeBreakEven(softerWithOrder, 1500);
    expect(softerBE.ticketsNeeded).toBeGreaterThan(baseBE.ticketsNeeded);
  });
});
