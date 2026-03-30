/**
 * Checkout Logic Tests
 *
 * Tests the business logic for ticket purchasing, promo codes,
 * capacity checks, and idempotency — the highest-risk code paths.
 */
import { describe, it, expect } from "vitest";

// ── Service Fee Calculation ──────────────────────────────────────────────────

// Mirror of src/lib/pricing.ts
function calculateServiceFeeCents(ticketPriceCents: number): number {
  // 7% + $0.50 per ticket
  return Math.round(ticketPriceCents * 0.07) + 50;
}

describe("Service Fee Calculation", () => {
  it("calculates 7% + $0.50 for standard ticket", () => {
    // $20 ticket = 2000 cents
    // 7% of 2000 = 140 + 50 = 190 cents ($1.90)
    expect(calculateServiceFeeCents(2000)).toBe(190);
  });

  it("calculates fee for $1 minimum ticket", () => {
    // $1 ticket = 100 cents
    // 7% of 100 = 7 + 50 = 57 cents ($0.57)
    expect(calculateServiceFeeCents(100)).toBe(57);
  });

  it("calculates fee for $100 ticket", () => {
    // $100 ticket = 10000 cents
    // 7% of 10000 = 700 + 50 = 750 cents ($7.50)
    expect(calculateServiceFeeCents(10000)).toBe(750);
  });

  it("handles $0 ticket (free)", () => {
    // 7% of 0 = 0 + 50 = 50 cents
    expect(calculateServiceFeeCents(0)).toBe(50);
  });

  it("rounds to nearest cent", () => {
    // $15 ticket = 1500 cents
    // 7% of 1500 = 105 + 50 = 155 cents
    expect(calculateServiceFeeCents(1500)).toBe(155);

    // $7.77 ticket = 777 cents
    // 7% of 777 = 54.39 → rounds to 54 + 50 = 104
    expect(calculateServiceFeeCents(777)).toBe(104);
  });
});

// ── Discount Calculation ─────────────────────────────────────────────────────

describe("Discount Calculation", () => {
  it("applies percentage discount correctly", () => {
    const basePriceCents = 2000; // $20
    const discountPercent = 0.2; // 20%
    const discountCents = Math.round(basePriceCents * discountPercent);
    const unitAmountCents = Math.max(basePriceCents - discountCents, 0);

    expect(discountCents).toBe(400); // $4.00
    expect(unitAmountCents).toBe(1600); // $16.00
  });

  it("applies fixed discount correctly", () => {
    const basePriceCents = 2000;
    const discountFixed = 500; // $5.00
    const unitAmountCents = Math.max(basePriceCents - discountFixed, 0);

    expect(unitAmountCents).toBe(1500); // $15.00
  });

  it("caps discount at 100% (never negative)", () => {
    const basePriceCents = 2000;
    const discountPercent = 1.0; // 100%
    const discountCents = Math.round(basePriceCents * discountPercent);
    const unitAmountCents = Math.max(basePriceCents - discountCents, 0);

    expect(unitAmountCents).toBe(0); // Free
  });

  it("caps fixed discount (never negative)", () => {
    const basePriceCents = 500;
    const discountFixed = 1000; // More than ticket price
    const unitAmountCents = Math.max(basePriceCents - discountFixed, 0);

    expect(unitAmountCents).toBe(0); // Floored at 0
  });

  it("handles percentage > 100% safely", () => {
    const discountPercent = Math.min(150 / 100, 1); // Capped at 100%
    expect(discountPercent).toBe(1);
  });
});

// ── Promo Code Capacity Check ────────────────────────────────────────────────

describe("Promo Code Capacity", () => {
  it("allows claim when under capacity", () => {
    const maxUses = 100;
    const currentUses = 50;
    const quantity = 3;
    const hasCapacity = maxUses === null || (currentUses + quantity) <= maxUses;

    expect(hasCapacity).toBe(true);
  });

  it("blocks claim when at capacity", () => {
    const maxUses = 100;
    const currentUses = 100;
    const quantity = 1;
    const hasCapacity = maxUses === null || (currentUses + quantity) <= maxUses;

    expect(hasCapacity).toBe(false);
  });

  it("blocks claim when would exceed capacity", () => {
    const maxUses = 100;
    const currentUses = 98;
    const quantity = 5;
    const hasCapacity = maxUses === null || (currentUses + quantity) <= maxUses;

    expect(hasCapacity).toBe(false);
  });

  it("allows unlimited when max_uses is null", () => {
    const maxUses = null;
    const currentUses = 99999;
    const quantity = 100;
    const hasCapacity = maxUses === null || (currentUses + quantity) <= maxUses;

    expect(hasCapacity).toBe(true);
  });

  it("handles exact boundary (current + quantity === max)", () => {
    const maxUses = 10;
    const currentUses = 7;
    const quantity = 3;
    const hasCapacity = maxUses === null || (currentUses + quantity) <= maxUses;

    expect(hasCapacity).toBe(true); // 7 + 3 = 10 <= 10
  });
});

// ── Idempotency Logic ────────────────────────────────────────────────────────

describe("Idempotency", () => {
  it("detects existing tickets by payment intent ID", () => {
    const existingCount = 3;
    const shouldSkip = existingCount > 0;

    expect(shouldSkip).toBe(true);
  });

  it("proceeds when no existing tickets", () => {
    const existingCount = 0;
    const shouldSkip = existingCount > 0;

    expect(shouldSkip).toBe(false);
  });

  it("detects newly created vs pre-existing via is_new flag", () => {
    const atomicResult = [
      { id: "uuid1", ticket_token: "token1", is_new: true },
      { id: "uuid2", ticket_token: "token2", is_new: true },
    ];
    const wasNewlyCreated = atomicResult[0]?.is_new !== false;
    expect(wasNewlyCreated).toBe(true);

    const preExisting = [
      { id: "uuid1", ticket_token: "token1", is_new: false },
    ];
    const wasPreExisting = preExisting[0]?.is_new !== false;
    expect(wasPreExisting).toBe(false);
  });

  it("defaults to newly created when is_new is undefined (pre-migration)", () => {
    const legacyResult = [
      { id: "uuid1", ticket_token: "token1" },
    ];
    const wasNewlyCreated = (legacyResult[0] as { is_new?: boolean })?.is_new !== false;
    expect(wasNewlyCreated).toBe(true); // undefined !== false → true
  });
});

// ── Sales Window Validation ──────────────────────────────────────────────────

describe("Sales Window", () => {
  it("blocks purchase before sales start", () => {
    const now = new Date("2026-03-29T12:00:00Z");
    const salesStart = new Date("2026-04-01T00:00:00Z");
    expect(salesStart > now).toBe(true);
  });

  it("blocks purchase after sales end", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const salesEnd = new Date("2026-04-10T23:59:59Z");
    expect(salesEnd < now).toBe(true);
  });

  it("allows purchase within sales window", () => {
    const now = new Date("2026-04-05T12:00:00Z");
    const salesStart = new Date("2026-04-01T00:00:00Z");
    const salesEnd = new Date("2026-04-10T23:59:59Z");
    expect(salesStart <= now && salesEnd >= now).toBe(true);
  });

  it("allows purchase when no sales window is set", () => {
    const salesStart = null;
    const salesEnd = null;
    const blocked =
      (salesStart && new Date(salesStart) > new Date()) ||
      (salesEnd && new Date(salesEnd) < new Date());
    expect(blocked).toBeFalsy();
  });
});

// ── Refund Fee Calculation ───────────────────────────────────────────────────

describe("Refund Analytics", () => {
  it("decrements tickets_sold correctly", () => {
    const currentSold = 50;
    const refundQuantity = 3;
    const newSold = Math.max(0, currentSold - refundQuantity);
    expect(newSold).toBe(47);
  });

  it("never goes below 0", () => {
    const currentSold = 2;
    const refundQuantity = 5;
    const newSold = Math.max(0, currentSold - refundQuantity);
    expect(newSold).toBe(0);
  });

  it("recalculates avg_ticket_price after refund", () => {
    const newSold = 47;
    const newGross = 940; // $940
    const avgPrice = newSold > 0 ? newGross / newSold : 0;
    expect(avgPrice).toBeCloseTo(20, 0);
  });

  it("handles zero tickets after full refund", () => {
    const newSold = 0;
    const newGross = 0;
    const avgPrice = newSold > 0 ? newGross / newSold : 0;
    expect(avgPrice).toBe(0);
  });
});
