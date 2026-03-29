import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Default IANA timezone for nightlife events */
export const DEFAULT_TIMEZONE = "America/Toronto";

/** Sanitize a URL for use in CSS backgroundImage — prevents CSS injection */
export function safeBgUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/")) {
    return `url(${encodeURI(url)})`;
  }
  return undefined;
}

/** Format a dollar amount for display (e.g. $1,234 or $12.3k) */
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 10000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
