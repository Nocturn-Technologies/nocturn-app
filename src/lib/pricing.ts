export const PLATFORM_FEE_PERCENT = 7;
export const PLATFORM_FEE_FLAT_CENTS = 50;

export function calculateServiceFeeCents(ticketPriceCents: number): number {
  return Math.round(ticketPriceCents * (PLATFORM_FEE_PERCENT / 100)) + PLATFORM_FEE_FLAT_CENTS;
}
