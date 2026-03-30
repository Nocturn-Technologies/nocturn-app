/**
 * Analytics Logic Tests
 *
 * Tests the segment derivation and attendee profiling logic.
 */
import { describe, it, expect } from "vitest";

// ── Segment Derivation ──────────────────────────────────────────────────────

function deriveSegment(totalSpent: number, totalEvents: number): string {
  if (totalSpent >= 200 || totalEvents >= 5) return "vip";
  if (totalEvents >= 2) return "repeat";
  return "new";
}

describe("Attendee Segment Derivation", () => {
  it("classifies new attendees", () => {
    expect(deriveSegment(20, 1)).toBe("new");
    expect(deriveSegment(0, 1)).toBe("new");
    expect(deriveSegment(199, 1)).toBe("new");
  });

  it("classifies repeat attendees (2+ events, under $200)", () => {
    expect(deriveSegment(50, 2)).toBe("repeat");
    expect(deriveSegment(100, 3)).toBe("repeat");
    expect(deriveSegment(199, 4)).toBe("repeat");
  });

  it("classifies VIP by spend ($200+)", () => {
    expect(deriveSegment(200, 1)).toBe("vip");
    expect(deriveSegment(500, 1)).toBe("vip");
    expect(deriveSegment(200, 2)).toBe("vip");
  });

  it("classifies VIP by event count (5+)", () => {
    expect(deriveSegment(10, 5)).toBe("vip");
    expect(deriveSegment(0, 10)).toBe("vip");
  });

  it("VIP by either condition (OR logic)", () => {
    expect(deriveSegment(200, 5)).toBe("vip");
    expect(deriveSegment(1000, 100)).toBe("vip");
  });

  it("handles edge cases", () => {
    expect(deriveSegment(0, 0)).toBe("new");
    expect(deriveSegment(-10, 1)).toBe("new"); // negative spend
    expect(deriveSegment(199.99, 4)).toBe("repeat"); // just under VIP
  });
});

// ── Revenue Calculations ─────────────────────────────────────────────────────

describe("Revenue Calculations", () => {
  it("calculates Nocturn fee correctly (7% + $0.50/ticket)", () => {
    const revenue = 100; // $100
    const quantity = 5;
    const fee = revenue * 0.07 + quantity * 0.5;
    expect(fee).toBe(9.5); // $7.00 + $2.50
  });

  it("calculates net revenue", () => {
    const grossRevenue = 1000;
    const quantity = 50;
    const nocturnFee = grossRevenue * 0.07 + quantity * 0.5;
    const netRevenue = Math.max(0, grossRevenue - nocturnFee);
    expect(nocturnFee).toBe(95); // $70 + $25
    expect(netRevenue).toBe(905);
  });

  it("never produces negative net revenue", () => {
    const grossRevenue = 5; // $5
    const quantity = 100;
    const nocturnFee = grossRevenue * 0.07 + quantity * 0.5;
    const netRevenue = Math.max(0, grossRevenue - nocturnFee);
    expect(netRevenue).toBe(0); // Fee ($50.35) > revenue ($5)
  });

  it("calculates capacity percentage", () => {
    const ticketsSold = 75;
    const totalCapacity = 100;
    const pct = totalCapacity > 0
      ? Math.min(100, (ticketsSold / totalCapacity) * 100)
      : 0;
    expect(pct).toBe(75);
  });

  it("caps capacity at 100% (oversold edge case)", () => {
    const ticketsSold = 110;
    const totalCapacity = 100;
    const pct = Math.min(100, (ticketsSold / totalCapacity) * 100);
    expect(pct).toBe(100);
  });

  it("handles zero capacity", () => {
    const ticketsSold = 50;
    const totalCapacity = 0;
    const pct = totalCapacity > 0
      ? Math.min(100, (ticketsSold / totalCapacity) * 100)
      : 0;
    expect(pct).toBe(0);
  });

  it("calculates conversion rate", () => {
    const checkoutStarts = 200;
    const completions = 50;
    const rate = checkoutStarts > 0
      ? Math.min(100, (completions / checkoutStarts) * 100)
      : 0;
    expect(rate).toBe(25);
  });

  it("caps conversion rate at 100%", () => {
    const checkoutStarts = 10;
    const completions = 15; // More completions than starts (edge case)
    const rate = Math.min(100, (completions / checkoutStarts) * 100);
    expect(rate).toBe(100);
  });
});

// ── GMV Growth Calculation ───────────────────────────────────────────────────

describe("GMV Growth", () => {
  it("calculates positive growth", () => {
    const current = 1000;
    const previous = 800;
    const growth = previous > 0
      ? ((current - previous) / previous) * 100
      : current > 0 ? 100 : 0;
    expect(growth).toBe(25);
  });

  it("calculates negative growth", () => {
    const current = 600;
    const previous = 800;
    const growth = previous > 0
      ? ((current - previous) / previous) * 100
      : 0;
    expect(growth).toBe(-25);
  });

  it("handles zero previous (100% growth)", () => {
    const current = 500;
    const previous = 0;
    const growth = previous > 0
      ? ((current - previous) / previous) * 100
      : current > 0 ? 100 : 0;
    expect(growth).toBe(100);
  });

  it("handles both zero (0% growth)", () => {
    const current = 0;
    const previous = 0;
    const growth = previous > 0
      ? ((current - previous) / previous) * 100
      : current > 0 ? 100 : 0;
    expect(growth).toBe(0);
  });
});
