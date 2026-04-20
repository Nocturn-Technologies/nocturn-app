/**
 * Redaction helpers for log statements that incidentally touch PII.
 *
 * In development we want full values for debugging; in production we
 * want to keep Sentry/Vercel logs audit-safe. These helpers no-op in
 * dev so local iteration stays readable, and redact on a prod build.
 *
 * Usage:
 *   console.info(`buyer: ${redactEmail(email)}`);
 *   console.warn(`phone check: ${redactPhone(phone)}`);
 */

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Mask an email to keep only its domain and a hint of the local part:
 *   "alice.smith@example.com" → "a***@example.com"
 * Returns the input unchanged in dev, "(null)" for nullish.
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "(null)";
  if (!IS_PROD) return email;
  const at = email.indexOf("@");
  if (at <= 0) return "(redacted)";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const hint = local.length > 0 ? local[0] : "";
  return `${hint}***${domain}`;
}

/**
 * Mask a phone to keep only last 2 digits:
 *   "+1 (416) 555-1234" → "***34"
 */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "(null)";
  if (!IS_PROD) return phone;
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 4) return "(redacted)";
  return `***${digits.slice(-2)}`;
}

/**
 * Redact a free-form string that might contain PII (e.g., concatenated
 * error messages with emails embedded). Best-effort regex sweep.
 */
export function redactFreeText(text: string | null | undefined): string {
  if (!text) return "(null)";
  if (!IS_PROD) return text;
  return text
    // emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    // phone-ish runs of 7+ digits with optional separators
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "[phone]");
}
