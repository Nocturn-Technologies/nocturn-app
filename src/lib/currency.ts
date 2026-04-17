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
const CURRENCY_SYMBOLS: Record<string, string> = {
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
function isZeroDecimal(currency: string): boolean {
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

// ─── Multi-currency budget support ──────────────────────────────────────────
// Used by the event budget intake: operators enter headliner fees in the
// currency they actually pay (USD for international DJs, local for venues),
// and the P&L converts everything to the event's currency at entry time.

/**
 * Convert a dollar amount (whole units, not cents) from one currency to
 * another, using USD as the cross-rate pivot.
 *
 * Returns the converted amount plus the effective rate so callers can
 * snapshot the rate for audit/settlement consistency.
 *
 * Falls back to { amount, rate: 1 } if either currency is unsupported —
 * callers should treat an explicit rate of 1 with mismatched currencies
 * as a "rate unavailable, check network" signal if needed.
 */
export async function convertBetween(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<{ amount: number; rate: number }> {
  const from = fromCurrency.toLowerCase();
  const to = toCurrency.toLowerCase();

  if (from === to || amount === 0) {
    return { amount, rate: 1 };
  }

  const rates = await getExchangeRates();
  // rates[] is USD → X. Cross-rate: (USD → to) / (USD → from) = from → to
  const usdToFrom = from === "usd" ? 1 : rates[from];
  const usdToTo = to === "usd" ? 1 : rates[to];

  if (!usdToFrom || !usdToTo) {
    return { amount, rate: 1 };
  }

  const rate = usdToTo / usdToFrom;
  const converted = amount * rate;
  // Round to nearest cent for non-zero-decimal currencies, whole unit for JPY etc.
  const rounded = isZeroDecimal(to) ? Math.round(converted) : Math.round(converted * 100) / 100;
  return { amount: rounded, rate };
}

/**
 * Common currencies operators will need to pick from in the budget form.
 * Keep this list short — long pickers are decision paralysis. If someone
 * needs an exotic currency we don't have, they can type it into "Other"
 * (or we add it here). Order reflects real-world use by Toronto/NYC
 * collectives: USD/CAD at top, then the main international DJ-fee currencies.
 */
export const SUPPORTED_CURRENCIES: Array<{ code: string; label: string }> = [
  { code: "usd", label: "USD · US Dollar" },
  { code: "cad", label: "CAD · Canadian Dollar" },
  { code: "eur", label: "EUR · Euro" },
  { code: "gbp", label: "GBP · British Pound" },
  { code: "aud", label: "AUD · Australian Dollar" },
  { code: "mxn", label: "MXN · Mexican Peso" },
  { code: "brl", label: "BRL · Brazilian Real" },
  { code: "jpy", label: "JPY · Japanese Yen" },
  { code: "chf", label: "CHF · Swiss Franc" },
  { code: "zar", label: "ZAR · South African Rand" },
];

/**
 * Small city → currency map used to pre-select the collective's default
 * currency at signup. Covers the nightlife cities we actually target;
 * unknowns fall through to USD (safe default matching ticket settlement).
 */
const CITY_CURRENCY: Record<string, string> = {
  toronto: "cad", montreal: "cad", vancouver: "cad", calgary: "cad", ottawa: "cad",
  "new york": "usd", nyc: "usd", "los angeles": "usd", la: "usd",
  miami: "usd", chicago: "usd", detroit: "usd", "san francisco": "usd", sf: "usd",
  austin: "usd", atlanta: "usd", boston: "usd", philadelphia: "usd", philly: "usd",
  london: "gbp", manchester: "gbp",
  berlin: "eur", paris: "eur", amsterdam: "eur", barcelona: "eur", madrid: "eur",
  milan: "eur", rome: "eur", ibiza: "eur",
  sydney: "aud", melbourne: "aud",
  tokyo: "jpy",
  "mexico city": "mxn", cdmx: "mxn",
  "sao paulo": "brl", "são paulo": "brl", rio: "brl",
};

/**
 * Infer a sensible default currency from a city name. Returns "usd" if
 * the city isn't in the map — safe fallback that matches how tickets
 * settle today.
 */
export function currencyForCity(city: string | null | undefined): string {
  if (!city) return "usd";
  return CITY_CURRENCY[city.trim().toLowerCase()] ?? "usd";
}
