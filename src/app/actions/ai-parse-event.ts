"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { rateLimitStrict } from "@/lib/rate-limit";

export interface TicketTier {
  name: string;
  price: number;
  capacity: number;
}

export interface ParsedEventDetails {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  doorsOpen?: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueCapacity?: number;
  description?: string;
  ticketPrice?: number;
  ticketQuantity?: number;
  ticketTierName?: string;
  tiers?: TicketTier[];
  // Budget planning fields
  headlinerType?: "local" | "international" | "none";
  headlinerOrigin?: string; // city/country for international
  talentFee?: number;
  estimatedFlights?: number;
  estimatedHotel?: number;
  estimatedTransport?: number;
  venueCost?: number;
  barMinimum?: number;
  deposit?: number;
  otherExpenses?: number;
  totalBudget?: number;
}

export async function parseEventDetails(
  message: string,
  existingData: Partial<ParsedEventDetails> = {}
): Promise<{ parsed: ParsedEventDetails; reply: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { parsed: {}, reply: "Not authenticated" };

  const { success: rlOk } = await rateLimitStrict(`ai-parse:${user.id}`, 20, 60_000);
  if (!rlOk) return { parsed: existingData as ParsedEventDetails, reply: "Too many requests. Please wait a moment." };

  if (!message.trim()) return { parsed: existingData as ParsedEventDetails, reply: "I didn't catch that. Try telling me your event details." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const localParsed = localParse(message, existingData);
  const merged = { ...existingData, ...localParsed };

  if (!apiKey) {
    return { parsed: merged, reply: generateReply(merged, localParsed) };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `You parse event details from natural language for a nightlife platform. Extract structured info from the user's message.

Already known: ${JSON.stringify(existingData)}
User says: "${message}"

Return ONLY valid JSON with any of these fields (omit what's not mentioned):
- title (string), date (YYYY-MM-DD), startTime (HH:MM 24h), endTime (HH:MM 24h), doorsOpen (HH:MM 24h)
- venueName (string), venueAddress (string), venueCity (string), venueCapacity (number)
- description (string), ticketPrice (number), ticketQuantity (number), ticketTierName (string)
- tiers (array of {name, price, capacity}): if user wants to update ticket tier prices or capacities
- talentFee (number): if user mentions talent fee, DJ fee, artist fee, headliner fee
- venueCost (number): if user mentions venue rental, room cost
- barMinimum (number): if user mentions bar minimum
- deposit (number): if user mentions deposit
- otherExpenses (number): if user mentions other expenses, sound, lighting, security, promo costs
- reply (string): casual 1-sentence acknowledgment of what you understood

When the user says things like "increase talent fee to $800" or "change early bird to $20" or "add a VIP tier at $50 for 30 people", extract the updated values.
Today is ${new Date().toISOString().split("T")[0]}. "10pm"="22:00". Assume PM for nightlife times without am/pm.`,
        }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate expected field types
      if (parsed.date && typeof parsed.date !== 'string') delete parsed.date;
      if (parsed.startTime && typeof parsed.startTime !== 'string') delete parsed.startTime;
      if (parsed.ticketPrice !== undefined && typeof parsed.ticketPrice !== 'number') delete parsed.ticketPrice;
      if (parsed.ticketQuantity !== undefined && typeof parsed.ticketQuantity !== 'number') delete parsed.ticketQuantity;
      const reply = parsed.reply || generateReply({ ...existingData, ...parsed }, parsed);
      delete parsed.reply;
      return { parsed: { ...existingData, ...stripEmpty(parsed) }, reply };
    }
  } catch (e) {
    console.error("[ai-parse-event] API error:", e);
    // Fall through
  }

  return { parsed: merged, reply: generateReply(merged, localParsed) };
}

function stripEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined && value !== "") result[key] = value;
  }
  return result;
}

function localParse(message: string, existing: Partial<ParsedEventDetails>): Partial<ParsedEventDetails> {
  const result: Partial<ParsedEventDetails> = {};
  const lower = message.toLowerCase().trim();

  // === TITLE ===
  // Extract title: first line or text before date/time/venue keywords
  const titleMatch = lower.match(/^([^,.\n]+?)(?:\s+(?:on|at|from|this|next|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]))/i);
  if (titleMatch) result.title = message.slice(0, titleMatch[1].length).trim();

  // === DATE ===
  // "2026-04-25"
  const isoDate = message.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoDate) result.date = isoDate[1];

  // "april 25", "apr 25", "march 30"
  const monthDay = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/);
  if (monthDay) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const m = months[monthDay[1].slice(0, 3)];
    const now = new Date();
    const currentYear = now.getFullYear();
    const parsedMonth = parseInt(m);
    const year = parsedMonth < (now.getMonth() + 1) ? currentYear + 1 : currentYear;
    result.date = `${year}-${m}-${monthDay[2].padStart(2, "0")}`;
  }

  // === TIME ===
  // "10pm", "10:30 pm", "10 pm", "starts at 10pm"
  const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  const times: string[] = [];
  let match;
  while ((match = timeRegex.exec(lower)) !== null) {
    let hour = parseInt(match[1]);
    const min = match[2] || "00";
    if (match[3].toLowerCase() === "pm" && hour < 12) hour += 12;
    if (match[3].toLowerCase() === "am" && hour === 12) hour = 0;
    times.push(`${hour.toString().padStart(2, "0")}:${min}`);
  }

  // "starts at 10", "at 10" (assume PM for nightlife)
  if (times.length === 0) {
    const impliedTime = lower.match(/(?:starts?\s+(?:at\s+)?|at\s+)(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:am|pm|cap|ticket|dollar))/);
    if (impliedTime) {
      let hour = parseInt(impliedTime[1]);
      const min = impliedTime[2] || "00";
      if (hour < 12 && hour >= 1) hour += 12; // assume PM
      times.push(`${hour.toString().padStart(2, "0")}:${min}`);
    }
  }

  // "doors at 9"
  const doorsMatch = lower.match(/doors?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (doorsMatch) {
    let hour = parseInt(doorsMatch[1]);
    const min = doorsMatch[2] || "00";
    if (doorsMatch[3] === "pm" && hour < 12) hour += 12;
    if (!doorsMatch[3] && hour < 12 && hour >= 1) hour += 12;
    result.doorsOpen = `${hour.toString().padStart(2, "0")}:${min}`;
  }

  if (times.length >= 1 && !result.doorsOpen) result.startTime = times[0];
  if (times.length >= 2) result.endTime = times[1];
  if (times.length >= 1 && result.doorsOpen) result.startTime = times[0];

  // === VENUE ===
  // "venue is Biblio", "venue name is biblio", "the venue is Story", "at The Warehouse", "@ Rebel"
  const venuePatterns = [
    /(?:venue|venue\s*name)\s+(?:is|:)\s+(.+)/i,
    /(?:the\s+venue\s+is)\s+(.+)/i,
    /(?:at|@)\s+([A-Z][A-Za-z\s'&]+?)(?:\s*[,.]|\s+(?:in|on|at|\d)|$)/,
    /(?:at|@)\s+(.+?)(?:\s+(?:in|on|,|\.|$))/i,
  ];
  for (const pattern of venuePatterns) {
    const venueMatch = message.match(pattern);
    if (venueMatch) {
      let name = venueMatch[1].trim();
      // Clean trailing punctuation and conjunctions
      name = name.replace(/[.,!?]+$/, "").replace(/\s+and\s+city.*$/i, "").replace(/\s+in\s+.*$/i, "").trim();
      if (name.length > 0 && name.length < 50) {
        result.venueName = name.charAt(0).toUpperCase() + name.slice(1);
        break;
      }
    }
  }

  // === CITY ===
  // "city is Toronto", "in Toronto", "city: toronto"
  const cityPatterns = [
    /city\s+(?:is|:)\s+(.+)/i,
    /\bin\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*)/,
  ];
  for (const pattern of cityPatterns) {
    const cityMatch = message.match(pattern);
    if (cityMatch) {
      let city = cityMatch[1].trim().replace(/[.,!?]+$/, "");
      if (city.length > 1 && city.length < 30) {
        result.venueCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
        break;
      }
    }
  }

  // === SMART FALLBACK ===
  // If nothing else was parsed from this message, treat the whole message
  // as filling the most important missing field
  const nothingParsed = !result.date && !result.startTime && !result.venueName && !result.venueCity && !result.ticketPrice && !result.doorsOpen;
  if (nothingParsed && lower.length > 0 && lower.length < 50) {
    const cleanText = message.trim().replace(/[.,!?]+$/, "");

    // Known cities
    const knownCities = ["toronto", "montreal", "vancouver", "ottawa", "calgary", "edmonton", "winnipeg", "new york", "nyc", "los angeles", "la", "miami", "chicago", "detroit", "brooklyn", "london", "berlin", "paris"];
    if (knownCities.includes(lower.replace(/[.,!?]/g, "").trim())) {
      result.venueCity = cleanText.charAt(0).toUpperCase() + cleanText.slice(1).toLowerCase();
    }
    // If venue is the missing field, treat as venue name
    else if (!existing.venueName && existing.title) {
      result.venueName = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    }
    // If city is the missing field and venue exists, treat as city
    else if (!existing.venueCity && existing.venueName) {
      result.venueCity = cleanText.charAt(0).toUpperCase() + cleanText.slice(1).toLowerCase();
    }
  }

  // === CAPACITY ===
  const capMatch = lower.match(/(\d+)\s*cap(?:acity)?|cap(?:acity)?\s*(?:is\s+)?(\d+)/);
  if (capMatch) result.venueCapacity = parseInt(capMatch[1] || capMatch[2]);

  // === PRICE ===
  const priceMatch = lower.match(/\$(\d+(?:\.\d{2})?)|(\d+)\s*(?:dollars|bucks)|price\s+(?:is\s+)?(\d+)/);
  if (priceMatch) result.ticketPrice = parseFloat(priceMatch[1] || priceMatch[2] || priceMatch[3]);

  // === QUANTITY ===
  const qtyMatch = lower.match(/(\d+)\s*tickets/);
  if (qtyMatch) result.ticketQuantity = parseInt(qtyMatch[1]);

  // === BUDGET FIELDS ===
  // "talent fee $800", "artist fee is $1200", "dj fee 500"
  const talentFeeMatch = lower.match(/(?:talent|artist|dj|headliner)\s*(?:fee|cost)?\s*(?:is|to|=|:)?\s*\$?([\d,]+)/);
  if (talentFeeMatch) result.talentFee = parseInt(talentFeeMatch[1].replace(/,/g, ""));

  // "increase talent fee to $800"
  const increaseTalentMatch = lower.match(/(?:increase|change|set|update|raise|lower|drop)\s*(?:the\s+)?(?:talent|artist|dj|headliner)\s*(?:fee|cost)?\s*(?:to|=|:)?\s*\$?([\d,]+)/);
  if (increaseTalentMatch) result.talentFee = parseInt(increaseTalentMatch[1].replace(/,/g, ""));

  // "venue cost $2000", "venue rental 1500"
  const venueCostMatch = lower.match(/(?:venue|room)\s*(?:cost|rental|rent|fee)?\s*(?:is|to|=|:)?\s*\$?([\d,]+)/);
  if (venueCostMatch) result.venueCost = parseInt(venueCostMatch[1].replace(/,/g, ""));

  // "bar minimum $3000"
  const barMinMatch = lower.match(/bar\s*(?:min(?:imum)?)\s*(?:is|to|=|:)?\s*\$?([\d,]+)/);
  if (barMinMatch) result.barMinimum = parseInt(barMinMatch[1].replace(/,/g, ""));

  return result;
}

function generateReply(allData: Partial<ParsedEventDetails>, newData: Partial<ParsedEventDetails>): string {
  // What did we just learn?
  const justParsed: string[] = [];
  if (newData.date) justParsed.push("date");
  if (newData.startTime) justParsed.push("time");
  if (newData.doorsOpen) justParsed.push("doors time");
  if (newData.venueName) justParsed.push(`venue (${newData.venueName})`);
  if (newData.venueCity) justParsed.push(`city (${newData.venueCity})`);
  if (newData.ticketPrice) justParsed.push("pricing");
  if (newData.venueCapacity) justParsed.push("capacity");

  // What's still missing?
  const missing: string[] = [];
  if (!allData.title) missing.push("event name");
  if (!allData.date) missing.push("date");
  if (!allData.startTime) missing.push("start time");
  if (!allData.venueName) missing.push("venue name");
  if (!allData.venueCity) missing.push("city");

  if (justParsed.length === 0) {
    if (missing.length > 0) {
      return `I didn't catch that. I still need: ${missing.join(", ")}.`;
    }
    return "Looks good! Anything else to add?";
  }

  if (missing.length === 0) {
    return `Got ${justParsed.join(", ")}. Looking good — ready to launch? 🚀`;
  }

  return `Got ${justParsed.join(", ")}! Still need: ${missing.join(", ")}.`;
}
