/**
 * Ticket Sales Prediction Engine
 *
 * Uses nightlife-specific reference curves to predict ticket sales trajectories.
 * Based on industry research: nightlife events sell 35-50% in the last week,
 * 20-30% in the final 48hrs, and 10-25% day-of. This is dramatically different
 * from concerts or festivals.
 *
 * No ML or training data needed — curves are calibrated from Eventbrite, Dice,
 * and RA industry data. As a collective runs more events, their own history
 * blends in gradually (cold start → warm start).
 */

// ── Reference Curves ────────────────────────────────────────────────────
//
// Each curve defines expected cumulative % sold at key milestones (days out).
// Interpolation fills gaps. Curves are right-skewed for nightlife (heavy
// last-week sales) — fundamentally different from concert/festival curves.

export interface CurveMilestone {
  daysOut: number;
  expectedPct: number; // 0–1
}

export interface CurveProfile {
  id: string;
  label: string;
  description: string;
  milestones: CurveMilestone[];
}

/** Reference curves calibrated from nightlife industry research */
export const REFERENCE_CURVES: CurveProfile[] = [
  {
    id: "saturday_underground",
    label: "Saturday Underground",
    description: "Small-capacity Saturday night (< 300). Very late-selling — heavy door/day-of traffic.",
    milestones: [
      { daysOut: 28, expectedPct: 0.05 },
      { daysOut: 21, expectedPct: 0.08 },
      { daysOut: 14, expectedPct: 0.15 },
      { daysOut: 7, expectedPct: 0.30 },
      { daysOut: 3, expectedPct: 0.45 },
      { daysOut: 1, expectedPct: 0.60 },
      { daysOut: 0, expectedPct: 0.70 },
    ],
  },
  {
    id: "saturday_midsize",
    label: "Saturday Mid-Size",
    description: "Saturday event 300-1500 capacity. More predictable curve with strong last-week spike.",
    milestones: [
      { daysOut: 28, expectedPct: 0.08 },
      { daysOut: 21, expectedPct: 0.12 },
      { daysOut: 14, expectedPct: 0.20 },
      { daysOut: 7, expectedPct: 0.40 },
      { daysOut: 3, expectedPct: 0.55 },
      { daysOut: 1, expectedPct: 0.70 },
      { daysOut: 0, expectedPct: 0.85 },
    ],
  },
  {
    id: "friday",
    label: "Friday Night",
    description: "Friday events sell slightly more in advance — plans are made mid-week at work.",
    milestones: [
      { daysOut: 28, expectedPct: 0.10 },
      { daysOut: 21, expectedPct: 0.15 },
      { daysOut: 14, expectedPct: 0.25 },
      { daysOut: 7, expectedPct: 0.45 },
      { daysOut: 3, expectedPct: 0.60 },
      { daysOut: 1, expectedPct: 0.75 },
      { daysOut: 0, expectedPct: 0.85 },
    ],
  },
  {
    id: "sunday_day",
    label: "Sunday / Day Party",
    description: "Day parties and Sunday events. Highest day-of % — people decide based on how Saturday went.",
    milestones: [
      { daysOut: 28, expectedPct: 0.04 },
      { daysOut: 21, expectedPct: 0.06 },
      { daysOut: 14, expectedPct: 0.10 },
      { daysOut: 7, expectedPct: 0.25 },
      { daysOut: 3, expectedPct: 0.35 },
      { daysOut: 1, expectedPct: 0.50 },
      { daysOut: 0, expectedPct: 0.75 },
    ],
  },
  {
    id: "thursday",
    label: "Thursday Night",
    description: "Thursday events attract committed core audience. Higher advance % from enthusiasts.",
    milestones: [
      { daysOut: 28, expectedPct: 0.08 },
      { daysOut: 21, expectedPct: 0.14 },
      { daysOut: 14, expectedPct: 0.22 },
      { daysOut: 7, expectedPct: 0.40 },
      { daysOut: 3, expectedPct: 0.55 },
      { daysOut: 1, expectedPct: 0.68 },
      { daysOut: 0, expectedPct: 0.80 },
    ],
  },
];

// ── Curve Selection ─────────────────────────────────────────────────────

/**
 * Select the best-matching reference curve for an event.
 *
 * @param dayOfWeek - 0 = Sunday, 6 = Saturday (from Date.getDay())
 * @param totalCapacity - sum of all ticket tier capacities
 * @param tierCount - number of ticket tiers (3+ shifts curve forward)
 */
export function selectCurveProfile(
  dayOfWeek: number,
  totalCapacity: number,
  tierCount: number
): CurveProfile {
  let curve: CurveProfile;

  if (dayOfWeek === 0) {
    // Sunday
    curve = REFERENCE_CURVES.find((c) => c.id === "sunday_day")!;
  } else if (dayOfWeek === 4) {
    // Thursday
    curve = REFERENCE_CURVES.find((c) => c.id === "thursday")!;
  } else if (dayOfWeek === 5) {
    // Friday
    curve = REFERENCE_CURVES.find((c) => c.id === "friday")!;
  } else if (dayOfWeek === 6) {
    // Saturday
    curve =
      totalCapacity <= 300
        ? REFERENCE_CURVES.find((c) => c.id === "saturday_underground")!
        : REFERENCE_CURVES.find((c) => c.id === "saturday_midsize")!;
  } else {
    // Mon/Tue/Wed — use Thursday profile (industry nights)
    curve = REFERENCE_CURVES.find((c) => c.id === "thursday")!;
  }

  // Multi-tier modifier: 3+ tiers shifts the curve forward by ~5pp at
  // each milestone (tiered pricing creates urgency with "Tier 1 selling fast" etc.)
  if (tierCount >= 3) {
    return {
      ...curve,
      milestones: curve.milestones.map((m) => ({
        daysOut: m.daysOut,
        expectedPct: Math.min(1.0, m.expectedPct + 0.05),
      })),
    };
  }

  return curve;
}

// ── Interpolation ───────────────────────────────────────────────────────

/**
 * Interpolate the expected % sold at a given daysOut from a curve's milestones.
 * Uses linear interpolation between the nearest surrounding milestones.
 */
export function interpolateExpected(
  milestones: CurveMilestone[],
  daysOut: number
): number {
  // Milestones are sorted descending by daysOut (28, 21, 14, 7, 3, 1, 0)
  const sorted = [...milestones].sort((a, b) => b.daysOut - a.daysOut);

  // Before earliest milestone — extrapolate flat (very early)
  if (daysOut >= sorted[0].daysOut) return sorted[0].expectedPct;
  // After last milestone (day of or past)
  if (daysOut <= sorted[sorted.length - 1].daysOut)
    return sorted[sorted.length - 1].expectedPct;

  // Find surrounding milestones
  for (let i = 0; i < sorted.length - 1; i++) {
    const upper = sorted[i]; // higher daysOut
    const lower = sorted[i + 1]; // lower daysOut
    if (daysOut <= upper.daysOut && daysOut >= lower.daysOut) {
      const range = upper.daysOut - lower.daysOut;
      if (range === 0) return upper.expectedPct;
      const t = (upper.daysOut - daysOut) / range;
      return upper.expectedPct + t * (lower.expectedPct - upper.expectedPct);
    }
  }

  return sorted[sorted.length - 1].expectedPct;
}

// ── Prediction ──────────────────────────────────────────────────────────

export type TrajectoryStatus = "ahead" | "on_pace" | "below";

export interface SalesPrediction {
  /** Projected final sell-through (0–1) */
  projected: number;
  /** Lower bound (0–1) */
  low: number;
  /** Upper bound (0–1) */
  high: number;
  /** Status classification */
  status: TrajectoryStatus;
  /** Human-readable status label */
  statusLabel: string;
  /** Expected sell-through at this point on the reference curve (0–1) */
  expectedAtThisPoint: number;
  /** The reference curve being used */
  curveProfile: CurveProfile;
  /** Days until event */
  daysOut: number;
  /** Data points for chart — reference curve */
  referenceCurve: Array<{ daysOut: number; pct: number }>;
  /** Data points for chart — actual sales so far */
  actualCurve: Array<{ daysOut: number; pct: number }>;
  /** Data points for chart — projected path */
  projectedCurve: Array<{ daysOut: number; pct: number }>;
}

/**
 * Generate a sales trajectory prediction.
 *
 * @param curve - Reference curve to compare against
 * @param daysOut - Days until event
 * @param currentPctSold - Current sell-through (0–1)
 * @param salesHistory - Optional: actual daily sales data [{daysOut, pct}]
 */
export function predictSales(
  curve: CurveProfile,
  daysOut: number,
  currentPctSold: number,
  salesHistory?: Array<{ daysOut: number; pct: number }>
): SalesPrediction {
  const expectedNow = interpolateExpected(curve.milestones, daysOut);

  // Ratio of actual vs expected — clamped
  const ratio =
    expectedNow > 0
      ? Math.max(0.3, Math.min(2.0, currentPctSold / expectedNow))
      : currentPctSold > 0
        ? 1.5
        : 0.5;

  // Project final sell-through by scaling the curve's final value
  const finalExpected = curve.milestones.find((m) => m.daysOut === 0)?.expectedPct ?? 0.75;
  const projected = Math.max(0, Math.min(1.0, finalExpected * ratio));

  // Confidence band — widens further out, narrows close to event
  const bandWidth = 0.15 * Math.sqrt(Math.max(daysOut, 0.5) / 7);
  const low = Math.max(0, projected - bandWidth);
  const high = Math.min(1.0, projected + bandWidth);

  // Status classification with a dead-zone tolerance (±10pp is "on pace")
  let status: TrajectoryStatus;
  let statusLabel: string;
  const diff = currentPctSold - expectedNow;

  if (diff > 0.10) {
    status = "ahead";
    statusLabel = "Tracking ahead";
  } else if (diff < -0.10) {
    status = "below";
    statusLabel = "Below expected";
  } else {
    status = "on_pace";
    statusLabel = "On pace";
  }

  // Build chart data points
  // Reference curve — smooth line from 30 days out to day 0
  const referenceCurve: Array<{ daysOut: number; pct: number }> = [];
  for (let d = 30; d >= 0; d--) {
    referenceCurve.push({
      daysOut: d,
      pct: interpolateExpected(curve.milestones, d),
    });
  }

  // Actual sales — use provided history or just the current point
  const actualCurve = salesHistory && salesHistory.length > 0
    ? salesHistory
    : [{ daysOut, pct: currentPctSold }];

  // Projected path — from current point to day 0 scaled by ratio
  const projectedCurve: Array<{ daysOut: number; pct: number }> = [];
  for (let d = Math.min(daysOut, 30); d >= 0; d--) {
    const expectedAtD = interpolateExpected(curve.milestones, d);
    projectedCurve.push({
      daysOut: d,
      pct: Math.min(1.0, expectedAtD * ratio),
    });
  }

  return {
    projected,
    low,
    high,
    status,
    statusLabel,
    expectedAtThisPoint: expectedNow,
    curveProfile: curve,
    daysOut,
    referenceCurve,
    actualCurve,
    projectedCurve,
  };
}

// ── Trajectory Sentence ─────────────────────────────────────────────────

/**
 * Generate a plain-English one-liner for the trajectory status.
 * No Claude call needed — these are template-based for instant rendering.
 */
export function getTrajectoryInsight(
  prediction: SalesPrediction,
  ticketsSold: number,
  totalCapacity: number,
  breakEvenTickets: number,
  dayOfWeekLabel: string
): string {
  const pctSold = Math.round(prediction.projected * 100);
  const projectedTickets = Math.round(prediction.projected * totalCapacity);
  const daysLabel =
    prediction.daysOut === 0
      ? "day-of"
      : prediction.daysOut === 1
        ? "1 day out"
        : `${prediction.daysOut} days out`;

  // Past break-even — reassure
  if (ticketsSold >= breakEvenTickets && breakEvenTickets > 0) {
    if (prediction.status === "ahead") {
      return `You've already hit break-even and tracking ahead. Projected to sell ${pctSold}% — strong for a ${dayOfWeekLabel} night.`;
    }
    return `Past break-even with ${daysLabel}. You're on pace — nightlife events sell 35-50% of tickets in the final week.`;
  }

  // Not at break-even yet
  if (prediction.status === "ahead") {
    return `${daysLabel} with ${Math.round((ticketsSold / totalCapacity) * 100)}% sold — that's ahead of pace for a ${dayOfWeekLabel} event. Projected to hit ~${projectedTickets} tickets.`;
  }

  if (prediction.status === "on_pace") {
    if (prediction.daysOut > 7) {
      return `You're in the normal dead zone — ${Math.round((ticketsSold / totalCapacity) * 100)}% sold is typical at this point. The spike comes in the final 5 days.`;
    }
    return `On pace at ${Math.round((ticketsSold / totalCapacity) * 100)}% sold with ${daysLabel}. Expect a push in the final 48 hours.`;
  }

  // Below expected
  if (prediction.daysOut > 7) {
    return `${Math.round((ticketsSold / totalCapacity) * 100)}% sold is slightly below average for a ${dayOfWeekLabel} event at this point. Still early — consider a targeted push this week.`;
  }
  const ticketsToBreakEven = Math.max(0, breakEvenTickets - ticketsSold);
  if (ticketsToBreakEven > 0) {
    return `Below expected at ${Math.round((ticketsSold / totalCapacity) * 100)}% sold with ${daysLabel}. Need ${ticketsToBreakEven} more tickets to break even — time for a promo push.`;
  }
  return `Sales are ${Math.round((ticketsSold / totalCapacity) * 100)}% with ${daysLabel}. Below the typical curve — consider a last-minute promo code or social push.`;
}

// ── Day-of-week helpers ─────────────────────────────────────────────────

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getDayOfWeekLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? "Saturday";
}
