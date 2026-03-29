/**
 * Currency localization for ticket purchases.
 *
 * Detects the buyer's country (via Vercel's x-vercel-ip-country header)
 * and converts USD prices to the buyer's local currency using cached
 * exchange rates from the Frankfurt Exchange API (free, no key).
 *
 * Stripe settles everything back to USD automatically — the organizer
 * always receives USD regardless of what currency the buyer pays in.
 */

// Country → Stripe currency code mapping (ISO 4217)
// Only includes countries where we'd want to localize.
// Everyone else gets USD.
const COUNTRY_CURRENCY: Record<string, string> = {
  // North America
  CA: "cad",
  MX: "mxn",
  // Europe
  AT: "eur", BE: "eur", CY: "eur", EE: "eur", FI: "eur",
  FR: "eur", DE: "eur", GR: "eur", IE: "eur", IT: "eur",
  LV: "eur", LT: "eur", LU: "eur", MT: "eur", NL: "eur",
  PT: "eur", SK: "eur", SI: "eur", ES: "eur",
  GB: "gbp",
  CH: "chf",
  SE: "sek",
  NO: "nok",
  DK: "dkk",
  PL: "pln",
  CZ: "czk",
  HU: "huf",
  RO: "ron",
  BG: "bgn",
  HR: "eur",
  // Asia-Pacific
  AU: "aud",
  NZ: "nzd",
  JP: "jpy",
  SG: "sgd",
  HK: "hkd",
  IN: "inr",
  MY: "myr",
  TH: "thb",
  PH: "php",
  KR: "krw",
  // Middle East / Africa
  AE: "aed",
  IL: "ils",
  ZA: "zar",
  // South America
  BR: "brl",
  CO: "cop",
  AR: "ars",
  CL: "clp",
};

// Zero-decimal currencies (Stripe expects amount in whole units, not cents)
const ZERO_DECIMAL_CURRENCIES = new Set([
  "jpy", "krw", "clp", "vnd", "bif", "djf", "gnf", "kmf",
  "mga", "pyg", "rwf", "ugx", "vuf", "xaf", "xof", "xpf",
]);

// Currency symbols for display
export const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$", eur: "\u20AC", gbp: "\u00A3", cad: "CA$", aud: "A$",
  nzd: "NZ$", jpy: "\u00A5", chf: "CHF ", sek: "kr ", nok: "kr ",
  dkk: "kr ", pln: "z\u0142", czk: "K\u010D ", huf: "Ft ", ron: "lei ",
  bgn: "лв ", brl: "R$", mxn: "MX$", inr: "\u20B9", sgd: "S$",
  hkd: "HK$", myr: "RM ", thb: "\u0E3F", php: "\u20B1", krw: "\u20A9",
  aed: "AED ", ils: "\u20AA", zar: "R ", cop: "COP ", ars: "ARS ", clp: "CLP ",
};

/**
 * Get the appropriate currency for a buyer's country.
 */
export function getCurrencyForCountry(countryCode: string | null): string {
  if (!countryCode) return "usd";
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] || "usd";
}

/**
 * Check if a currency uses zero-decimal formatting.
 */
export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
}

// In-memory cache for exchange rates (refreshed every hour)
let rateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch exchange rates from a free API (cached for 1 hour).
 * Uses frankfurter.app (European Central Bank data, no API key needed).
 */
async function getExchangeRates(): Promise<Record<string, number>> {
  if (rateCache && Date.now() - rateCache.fetchedAt < CACHE_TTL) {
    return rateCache.rates;
  }

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error("[currency] Exchange rate API failed:", res.status);
      return rateCache?.rates ?? {};
    }

    const data = await res.json();
    const rates: Record<string, number> = {};

    // frankfurter returns uppercase codes
    for (const [code, rate] of Object.entries(data.rates)) {
      rates[code.toLowerCase()] = rate as number;
    }
    rates["usd"] = 1;

    rateCache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    console.error("[currency] Exchange rate fetch failed:", err);
    return rateCache?.rates ?? { usd: 1 };
  }
}

/**
 * Convert a USD cent amount to the target currency's smallest unit.
 *
 * Example: 1500 USD cents (=$15.00), target "eur" with rate 0.92 → 1380 EUR cents
 * Example: 1500 USD cents (=$15.00), target "jpy" with rate 150 → 2250 JPY (zero-decimal)
 */
export async function convertAmount(
  usdCents: number,
  targetCurrency: string
): Promise<{ amount: number; rate: number; currency: string }> {
  const currency = targetCurrency.toLowerCase();

  if (currency === "usd") {
    return { amount: usdCents, rate: 1, currency: "usd" };
  }

  const rates = await getExchangeRates();
  const rate = rates[currency];

  if (!rate) {
    // Unknown currency — fall back to USD
    console.warn(`[currency] No rate for ${currency}, falling back to USD`);
    return { amount: usdCents, rate: 1, currency: "usd" };
  }

  const usdDollars = usdCents / 100;
  const localDollars = usdDollars * rate;

  let amount: number;
  if (isZeroDecimal(currency)) {
    // Round to whole units
    amount = Math.round(localDollars);
  } else {
    // Convert to smallest unit (cents equivalent)
    amount = Math.round(localDollars * 100);
  }

  return { amount, rate, currency };
}

/**
 * Format an amount for display (e.g., "€13.80", "¥2,250").
 */
export function formatLocalAmount(amount: number, currency: string): string {
  const curr = currency.toLowerCase();
  const symbol = CURRENCY_SYMBOLS[curr] || `${currency.toUpperCase()} `;

  if (isZeroDecimal(curr)) {
    return `${symbol}${amount.toLocaleString()}`;
  }

  return `${symbol}${(amount / 100).toFixed(2)}`;
}
