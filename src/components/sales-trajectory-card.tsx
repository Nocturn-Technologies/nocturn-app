"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SalesPrediction } from "@/lib/sales-prediction";

// ── Helpers ────────────────────────────────────────────────────────────

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

const STATUS_CONFIG = {
  ahead: {
    label: "Tracking ahead",
    color: "text-green-400",
    bg: "bg-green-500/15",
    border: "border-green-500/20",
    icon: TrendingUp,
  },
  on_pace: {
    label: "On pace",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/20",
    icon: Minus,
  },
  below: {
    label: "Below expected",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/20",
    icon: TrendingDown,
  },
} as const;

// ── Sparkline Chart (inline SVG) ───────────────────────────────────────

function TrajectoryChart({
  prediction,
  breakEvenPct,
}: {
  prediction: SalesPrediction;
  breakEvenPct: number;
}) {
  const W = 280;
  const H = 100;
  const PAD_X = 4;
  const PAD_Y = 8;

  // Chart maps daysOut (30→0) to X, and pct (0→1) to Y
  const xScale = (daysOut: number) =>
    PAD_X + ((30 - daysOut) / 30) * (W - PAD_X * 2);
  const yScale = (pct: number) =>
    H - PAD_Y - pct * (H - PAD_Y * 2);

  // Build SVG paths
  const toPath = (points: Array<{ daysOut: number; pct: number }>) => {
    if (points.length === 0) return "";
    const sorted = [...points].sort((a, b) => b.daysOut - a.daysOut);
    return sorted
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.daysOut).toFixed(1)},${yScale(p.pct).toFixed(1)}`)
      .join(" ");
  };

  const refPath = toPath(prediction.referenceCurve);
  const projPath = toPath(prediction.projectedCurve);

  // Actual sales — dots + line
  const actualSorted = [...prediction.actualCurve].sort(
    (a, b) => b.daysOut - a.daysOut
  );
  const actualPath = toPath(actualSorted);

  // Break-even line
  const beY = yScale(Math.min(breakEvenPct, 1));

  // Current position dot
  const currentPoint = actualSorted[actualSorted.length - 1];
  const cx = currentPoint ? xScale(currentPoint.daysOut) : 0;
  const cy = currentPoint ? yScale(currentPoint.pct) : 0;

  // "Now" marker X
  const nowX = xScale(prediction.daysOut);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      style={{ maxHeight: 120 }}
      aria-label="Sales trajectory chart"
    >
      {/* Grid lines */}
      <line
        x1={PAD_X} y1={yScale(0.25)} x2={W - PAD_X} y2={yScale(0.25)}
        stroke="currentColor" strokeOpacity={0.06} strokeDasharray="3,3"
      />
      <line
        x1={PAD_X} y1={yScale(0.5)} x2={W - PAD_X} y2={yScale(0.5)}
        stroke="currentColor" strokeOpacity={0.06} strokeDasharray="3,3"
      />
      <line
        x1={PAD_X} y1={yScale(0.75)} x2={W - PAD_X} y2={yScale(0.75)}
        stroke="currentColor" strokeOpacity={0.06} strokeDasharray="3,3"
      />

      {/* Break-even line */}
      {breakEvenPct > 0 && breakEvenPct <= 1 && (
        <>
          <line
            x1={PAD_X} y1={beY} x2={W - PAD_X} y2={beY}
            stroke="#fbbf24" strokeOpacity={0.4} strokeDasharray="4,4" strokeWidth={1}
          />
          <text x={W - PAD_X - 2} y={beY - 3} textAnchor="end" fill="#fbbf24" fontSize={8} opacity={0.7}>
            BE
          </text>
        </>
      )}

      {/* Reference curve (dotted, dim) */}
      <path
        d={refPath}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />

      {/* Projected path (dashed, themed) */}
      <path
        d={projPath}
        fill="none"
        stroke="#7B2FF7"
        strokeOpacity={0.5}
        strokeWidth={1.5}
        strokeDasharray="6,3"
      />

      {/* Confidence band (shaded area around projected) */}
      {prediction.projectedCurve.length > 1 && (() => {
        const sorted = [...prediction.projectedCurve].sort((a, b) => b.daysOut - a.daysOut);
        const bandWidth = 0.15 * Math.sqrt(Math.max(prediction.daysOut, 0.5) / 7);
        const upper = sorted
          .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.daysOut).toFixed(1)},${yScale(Math.min(1, p.pct + bandWidth)).toFixed(1)}`)
          .join(" ");
        const lower = [...sorted]
          .reverse()
          .map((p, i) => `${i === 0 ? "L" : "L"}${xScale(p.daysOut).toFixed(1)},${yScale(Math.max(0, p.pct - bandWidth)).toFixed(1)}`)
          .join(" ");
        return (
          <path
            d={`${upper} ${lower} Z`}
            fill="#7B2FF7"
            fillOpacity={0.08}
          />
        );
      })()}

      {/* Actual sales line (solid, bright) */}
      {actualSorted.length > 1 && (
        <path
          d={actualPath}
          fill="none"
          stroke="#7B2FF7"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}

      {/* Current position dot */}
      {currentPoint && (
        <>
          <circle cx={cx} cy={cy} r={4} fill="#7B2FF7" />
          <circle cx={cx} cy={cy} r={7} fill="#7B2FF7" fillOpacity={0.2} />
        </>
      )}

      {/* "Now" vertical marker */}
      <line
        x1={nowX} y1={PAD_Y} x2={nowX} y2={H - PAD_Y}
        stroke="currentColor" strokeOpacity={0.1} strokeWidth={1}
      />
      <text x={nowX} y={H - 1} textAnchor="middle" fill="currentColor" fontSize={7} opacity={0.3}>
        now
      </text>

      {/* Axis labels */}
      <text x={PAD_X + 2} y={H - 1} textAnchor="start" fill="currentColor" fontSize={7} opacity={0.3}>
        30d
      </text>
      <text x={W - PAD_X - 2} y={H - 1} textAnchor="end" fill="currentColor" fontSize={7} opacity={0.3}>
        0d
      </text>
    </svg>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────

function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-[2px] bg-nocturn rounded-full" />
        <span className="text-[11px] text-muted-foreground">Actual</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-[2px] border-t-2 border-dashed border-nocturn/50 rounded-full" />
        <span className="text-[11px] text-muted-foreground">Projected</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-[2px] border-t border-dashed border-foreground/20 rounded-full" />
        <span className="text-[11px] text-muted-foreground">Normal curve</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-[2px] border-t border-dashed border-amber-400/50 rounded-full" />
        <span className="text-[11px] text-muted-foreground">Break-even</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

interface SalesTrajectoryCardProps {
  prediction: SalesPrediction;
  ticketsSold: number;
  totalCapacity: number;
  breakEvenTickets: number;
  insight: string;
}

export function SalesTrajectoryCard({
  prediction,
  ticketsSold: _ticketsSold,
  totalCapacity,
  breakEvenTickets,
  insight,
}: SalesTrajectoryCardProps) {
  const cfg = STATUS_CONFIG[prediction.status];
  const StatusIcon = cfg.icon;
  const projectedTickets = Math.round(prediction.projected * totalCapacity);
  const breakEvenPct = totalCapacity > 0 ? breakEvenTickets / totalCapacity : 0;

  return (
    <Card className={`border-border bg-card overflow-hidden`}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-nocturn" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Sales Trajectory
            </h2>
          </div>
          {/* Status pill */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color} ${cfg.border} border`}
          >
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </div>
        </div>

        {/* Headline prediction */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums">
              {formatPct(prediction.projected)}
            </span>
            <span className="text-sm text-muted-foreground">
              projected ({projectedTickets} / {totalCapacity})
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Range: {formatPct(prediction.low)} – {formatPct(prediction.high)}
          </p>
        </div>

        {/* Chart */}
        <div className="rounded-lg bg-muted/20 p-3">
          <TrajectoryChart prediction={prediction} breakEvenPct={breakEvenPct} />
          <ChartLegend />
        </div>

        {/* Money agent insight */}
        <div className="rounded-lg bg-nocturn/5 border border-nocturn/10 p-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="text-nocturn font-semibold">Money:</span>{" "}
            {insight}
          </p>
        </div>

        {/* Curve info */}
        <p className="text-[11px] text-muted-foreground/70">
          Compared to: {prediction.curveProfile.label} reference curve
        </p>
      </CardContent>
    </Card>
  );
}
