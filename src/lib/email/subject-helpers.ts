// Subject-line helpers for transactional + promotional emails.
//
// Standardizes email subject formatting to:
//   1. Strip control characters / CRLF (header injection prevention)
//   2. Collapse whitespace
//   3. Cap at 78 characters (RFC 5322 recommendation, also avoids Gmail truncation)
//
// Existing convention: when a value is interpolated from user input
// (event title, collective name, buyer name), always run it through
// `sanitizeSubject` before passing to `sendEmail`.

const MAX_SUBJECT_LEN = 78;

export function sanitizeSubject(input: string): string {
  if (!input) return "";

  // Strip control chars + CR/LF (header injection)
  const stripped = input.replace(/[\r\n\x00-\x1f\x7f]/g, "");

  // Collapse whitespace runs
  const collapsed = stripped.replace(/\s+/g, " ").trim();

  // Truncate to 78 chars with an ellipsis if cut
  if (collapsed.length <= MAX_SUBJECT_LEN) return collapsed;
  return collapsed.slice(0, MAX_SUBJECT_LEN - 1).trimEnd() + "…";
}

// Common subject formulas — outcome-first, time-anchored.
// Each helper sanitizes and caps for you.
export const subjects = {
  ticketConfirmed: (eventTitle: string, dateShort: string) =>
    sanitizeSubject(`You're in. ${eventTitle} · ${dateShort}`),

  rsvpConfirmed: (eventTitle: string) =>
    sanitizeSubject(`You're on the list · ${eventTitle}`),

  rsvpMaybe: (eventTitle: string) =>
    sanitizeSubject(`Got it — we'll save you a spot at ${eventTitle}`),

  reminder24h: (eventTitle: string) =>
    sanitizeSubject(`Tomorrow · ${eventTitle}`),

  dayOf: (eventTitle: string) => sanitizeSubject(`Tonight · ${eventTitle}`),

  organizerCountdown: (
    eventTitle: string,
    sold: number,
    capacity: number,
  ) =>
    sanitizeSubject(`48 hours · ${eventTitle} · ${sold}/${capacity} sold`),

  milestone: (eventTitle: string, milestone: string, sold: number, cap: number) =>
    sanitizeSubject(`${milestone} · ${eventTitle} (${sold}/${cap})`),

  inactiveNudge: (collectiveName: string) =>
    sanitizeSubject(`${collectiveName} — what's next?`),

  invitation: (inviterName: string, collectiveName: string) =>
    sanitizeSubject(`${inviterName} invited you to ${collectiveName}`),

  welcome: (firstName: string) =>
    sanitizeSubject(`Welcome to Nocturn, ${firstName}`),

  lineupInvite: (eventTitle: string) =>
    sanitizeSubject(`You're booked — ${eventTitle}`),

  referralNudge: (eventTitle: string) =>
    sanitizeSubject(`Bring someone to ${eventTitle}`),

  eventUpdate: (eventTitle: string) =>
    sanitizeSubject(`Update · ${eventTitle}`),

  marketplaceInquiry: (senderName: string) =>
    sanitizeSubject(`${senderName} wants to connect on Nocturn`),
};
