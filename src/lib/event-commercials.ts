export interface EventCommercialConfig {
  venueCost: number | null;
  venueDeposit: number | null;
  barMinimum: number | null;
  projectedBarSales: number | null;
  barPercent: number | null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function readEventCommercialConfig(metadata: unknown): EventCommercialConfig {
  const meta = asRecord(metadata);

  return {
    venueCost: asNumber(meta.venue_cost ?? meta.venueCost),
    venueDeposit: asNumber(meta.venue_deposit ?? meta.venueDeposit),
    barMinimum: asNumber(meta.bar_minimum ?? meta.barMinimum),
    projectedBarSales: asNumber(
      meta.projected_bar_sales ??
      meta.projectedBarSales ??
      meta.estimated_bar_revenue ??
      meta.estimatedBarRevenue
    ),
    barPercent: asNumber(meta.bar_percentage ?? meta.barPercent),
  };
}

export function getProjectedBarRevenue(config: EventCommercialConfig): number | null {
  if (config.projectedBarSales == null) return null;
  if (config.barPercent == null) return config.projectedBarSales;
  return roundMoney(config.projectedBarSales * (config.barPercent / 100));
}

export function mergeEventCommercialMetadata(
  metadata: unknown,
  updates: Partial<EventCommercialConfig>
): UnknownRecord {
  const merged = { ...asRecord(metadata) };

  const assign = (key: string, value: number | null | undefined, legacyKey?: string) => {
    if (value == null) {
      delete merged[key];
      if (legacyKey) delete merged[legacyKey];
      return;
    }
    merged[key] = roundMoney(value);
    if (legacyKey) delete merged[legacyKey];
  };

  assign("venue_cost", updates.venueCost, "venueCost");
  assign("venue_deposit", updates.venueDeposit, "venueDeposit");
  assign("bar_minimum", updates.barMinimum, "barMinimum");
  assign("projected_bar_sales", updates.projectedBarSales, "projectedBarSales");
  assign("bar_percentage", updates.barPercent, "barPercent");

  const projected = getProjectedBarRevenue(readEventCommercialConfig(merged));
  if (projected == null) {
    delete merged.estimated_bar_revenue;
    delete merged.estimatedBarRevenue;
  } else {
    merged.estimated_bar_revenue = projected;
    delete merged.estimatedBarRevenue;
  }

  return merged;
}
