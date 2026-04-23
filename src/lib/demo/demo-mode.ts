/**
 * Demo-mode overlay. Surfaces realistic dummy data ONLY for the pitch demo
 * account (shawnqanun@gmail.com) so the app feels fullsome when we're
 * showing it to prospective collectives. This does not write to the DB.
 */

export const DEMO_EMAIL = "shawnqanun@gmail.com";

export function isDemoUser(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEMO_EMAIL;
}
