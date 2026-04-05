import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Default IANA timezone for nightlife events */
export const DEFAULT_TIMEZONE = "America/Toronto";

/**
 * Marketplace user types that skip collective onboarding.
 * These are auto-approved and don't need to create a collective.
 * Single source of truth — used in layout.tsx, middleware, signup, admin.
 */
export const MARKETPLACE_USER_TYPES = [
  "promoter",
  "artist",
  "venue",
  "photographer",
  "videographer",
  "sound_production",
  "lighting_production",
  "sponsor",
  "artist_manager",
  "tour_manager",
  "booking_agent",
  "event_staff",
  "mc_host",
  "graphic_designer",
  "pr_publicist",
] as const;

/** Sanitize a URL for use in CSS backgroundImage — prevents CSS injection */
export function safeBgUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/")) {
    return `url(${encodeURI(url)})`;
  }
  return undefined;
}

/** UUID v4 format regex */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a string is a valid UUID v4 */
export function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

/**
 * Sanitize input for use in PostgREST filter strings (.or(), .ilike(), etc.).
 * Removes characters that could be used to inject PostgREST operators.
 */
export function sanitizePostgRESTInput(input: string): string {
  // Remove PostgREST special chars: . , ( ) ' " and backslash
  // Then escape ILIKE wildcards
  return input
    .replace(/[.,()'"\\]/g, "")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .slice(0, 200); // hard length cap
}

/** Allowed MIME types for image uploads */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** Allowed MIME types for audio uploads */
export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

/** Blocked file extensions that could contain executable content */
const BLOCKED_EXTENSIONS = new Set([
  "svg", "html", "htm", "xml", "xhtml", "aspx", "jsp", "php", "js", "mjs", "ts", "exe", "bat", "sh",
]);

/**
 * Validate a file for upload: checks MIME type allowlist and blocks dangerous extensions.
 * Returns an error message if invalid, null if OK.
 */
export function validateFileUpload(
  file: { name: string; type: string; size: number },
  opts: { allowedTypes: readonly string[]; maxSizeMB: number }
): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `File type .${ext} is not allowed`;
  }
  if (!opts.allowedTypes.includes(file.type)) {
    return `File type ${file.type || "unknown"} is not supported`;
  }
  if (file.size > opts.maxSizeMB * 1024 * 1024) {
    return `File is too large (max ${opts.maxSizeMB}MB)`;
  }
  return null;
}

/** Format a dollar amount for display (e.g. $1,234 or $12.3k) */
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 10000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
