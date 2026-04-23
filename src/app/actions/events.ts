"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/config";
import { generateAutoSettlement } from "./auto-settlement";
import { getStripe } from "@/lib/stripe";
import { DEFAULT_TIMEZONE } from "@/lib/utils";
import { rateLimitStrict } from "@/lib/rate-limit";
import { mergeEventCommercialMetadata } from "@/lib/event-commercials";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function untypedCollectives(admin: ReturnType<typeof createAdminClient>) {
  return (admin as unknown as SupabaseClient).from("collectives");
}

interface CreateEventInput {
  title: string;
  slug: string;
  description: string | null;
  date: string;
  doorsOpen: string | null;
  startTime: string;
  endTime: string | null;
  venueName: string;
  venueAddress: string | null;
  venueCity: string;
  venueCapacity: number;
  tiers: { name: string; price: number; quantity: number }[];
  timezone?: string; // IANA timezone, defaults to America/Toronto
  isFree?: boolean;
  // ── Budget fields from the wizard's budget step ──
  // These are optional because the budget step is skippable. When present,
  // they get persisted so the P&L page can read them back instead of asking
  // the user to re-enter every cost on a separate screen.
  talentFee?: number | null;
  venueCost?: number | null;
  venueDeposit?: number | null;
  barMinimum?: number | null;
  estimatedBarRevenue?: number | null;
  projectedBarSales?: number | null;
  barPercent?: number | null;
  // Free-form bucket from the budget step ("sound, lights, security, promo").
  // Stored as a single line in the event_expenses table so it shows up in the P&L.
  otherExpenses?: number | null;
  // Talent travel (flights/hotel/transport/per diem). May be a server-computed
  // estimate from calculateBudget rather than a user input.
  travelCost?: number | null;
  // When the wizard's Budget step produces resolved line items via
  // calculateBudget(), they land here. Each row writes to the `event_expenses`
  // table for later settlement math.
  expenseItems?: Array<{
    category: string;
    label: string;
    amount: number;
  }> | null;
}

interface UpdateEventInput {
  title: string;
  description: string | null;
  date: string;
  doorsOpen: string | null;
  startTime: string;
  endTime: string | null;
  venueName: string;
  venueAddress: string | null;
  venueCity: string;
  venueCapacity: number;
  tiers: { id?: string; name: string; price: number; quantity: number }[];
  removedTierIds: string[];
  barMinimum?: number | null;
  venueDeposit?: number | null;
  venueCost?: number | null;
  estimatedBarRevenue?: number | null;
  projectedBarSales?: number | null;
  barPercent?: number | null;
  timezone?: string; // IANA timezone, defaults to America/Toronto
  // Itemized expenses. Reconciled against the `event_expenses` table:
  //   id present → update in place
  //   id absent  → insert new row
  //   ids listed in `removedExpenseIds` → deleted
  // If `expenseItems` is undefined, expenses are left untouched (the old
  // edit-path behavior — handy so callers that don't know about expenses
  // don't accidentally wipe them).
  expenseItems?: Array<{
    id?: string;
    category: string;
    label: string;
    amount: number;
  }>;
  removedExpenseIds?: string[];
}

export async function createEvent(input: CreateEventInput) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const { success: rlOk } = await rateLimitStrict(`createEvent:${user.id}`, 5, 60_000);
  if (!rlOk) {
    return { error: "Too many requests. Please wait a moment." };
  }

  if (input.description && input.description.length > 5000) {
    return { error: "Description is too long. Please keep it under 5,000 characters." };
  }

  // Title validation
  const trimmedTitle = input.title?.trim();
  if (!trimmedTitle || trimmedTitle.length === 0) {
    return { error: "Event title is required." };
  }
  if (trimmedTitle.length > 200) {
    return { error: "Event title must be under 200 characters." };
  }

  const trimmedAddress = input.venueAddress?.trim() || null;

  // Tier validation (same rules as ticket-tiers.ts createTicketTier)
  for (const t of input.tiers) {
    const tierName = t.name?.trim();
    if (!tierName || tierName.length === 0) {
      return { error: "Invalid ticket tier: name is required." };
    }
    if (tierName.length > 100) {
      return { error: "Invalid ticket tier: name must be under 100 characters." };
    }
    if (t.price < 0 || t.price > 99999.99 || !Number.isFinite(t.price)) {
      return { error: "Invalid ticket tier: price must be between $0 and $99,999.99." };
    }
    if (t.quantity < 1 || t.quantity > 1000000 || !Number.isInteger(t.quantity)) {
      return { error: "Invalid ticket tier: capacity must be a whole number between 1 and 1,000,000." };
    }
  }

  if (input.tiers.length > 0 && input.tiers.length > 10) {
    return { error: "Maximum 10 ticket tiers allowed." };
  }

  const admin = createAdminClient();

  // Get user's first collective
  const { data: memberships, error: membershipsError } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1);

  if (membershipsError) {
    console.error("[createEvent] memberships query error:", membershipsError.message);
    return { error: "Failed to verify membership" };
  }

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found. Please create one first." };
  }

  const collectiveId = memberships[0].collective_id;

  // Build timestamps from date + time inputs
  // Use America/Toronto timezone by default for nightlife events
  // The ISO string with offset ensures correct storage regardless of server timezone
  const tz = input.timezone ?? DEFAULT_TIMEZONE;
  function toTimestamp(date: string, time: string): string {
    // Create date string with explicit timezone offset
    // This ensures "10pm" in Toronto is stored as 10pm ET, not 10pm UTC
    const dt = new Date(`${date}T${time}:00`);
    // Format with timezone using Intl to get the correct offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZoneName: "longOffset",
    });
    // Use the formatter to get the correct offset for the given timezone
    const parts = formatter.formatToParts(dt);
    const offsetPart = parts.find(p => p.type === "timeZoneName")?.value ?? "+00:00";
    // longOffset gives e.g. "GMT-04:00" — strip the "GMT" prefix
    const offset = offsetPart.replace("GMT", "") || "+00:00";
    return `${date}T${time}:00${offset}`;
  }

  const startsAt = toTimestamp(input.date, input.startTime);

  // Cross-midnight handling: if end time is before start time, add one day
  let endDate = input.date;
  if (input.endTime) {
    const [startHour, startMinute] = input.startTime.split(":").map(Number);
    const [endHour, endMinute] = input.endTime.split(":").map(Number);
    if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
      const nextDay = new Date(`${input.date}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      endDate = nextDay.toISOString().split("T")[0];
    }
  }

  const endsAt = input.endTime
    ? toTimestamp(endDate, input.endTime)
    : null;
  const doorsAt = input.doorsOpen
    ? toTimestamp(input.date, input.doorsOpen)
    : null;

  // Validate event is not in the past (allow same-day events)
  const eventDate = new Date(startsAt);
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Compare dates, not times
  if (eventDate < now) {
    return { error: "Event date can't be in the past. Pick a future date." };
  }

  // Enrich event with AI-generated content if no description provided
  let enrichedDescription = input.description;
  let vibeTags: string[] = [];
  let dressCode: string | null = null;
  let hostMessage: string | null = null;

  if (!input.description || input.description.length < 20) {
    try {
      const { enrichEventContent } = await import("./ai-enrich-event");
      const { data: collective } = await admin
        .from("collectives")
        .select("name")
        .eq("id", collectiveId)
        .maybeSingle();

      const enriched = await enrichEventContent({
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        venueName: input.venueName,
        venueCity: input.venueCity,
        headlinerType: (input as unknown as Record<string, unknown>).headlinerType as string | undefined,
        collectiveName: collective?.name ?? undefined,
        tiers: input.tiers.map(t => ({ name: t.name, price: t.price })),
      });

      enrichedDescription = enriched.description;
      vibeTags = enriched.vibeTags;
      dressCode = enriched.dressCode;
      hostMessage = enriched.hostMessage;
    } catch (err) {
      console.error("AI enrichment failed, continuing without:", err);
    }
  }

  // Check for slug collision, append random suffix if needed
  let eventSlug = slugify(input.slug);
  if (!eventSlug || eventSlug.length < 2) {
    eventSlug = `event-${Math.random().toString(36).slice(2, 8)}`;
  }
  const { data: slugCheck } = await admin
    .from("events")
    .select("id")
    .eq("slug", eventSlug)
    .maybeSingle();
  if (slugCheck) {
    eventSlug = `${eventSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const isFree = typeof input.isFree === "boolean" ? input.isFree : false;

  // Sanitize budget fields. NUMERIC(10,2) caps and non-negative — anything
  // out of range gets dropped silently rather than blowing up the whole
  // event create. The wizard already enforces these but defense in depth.
  function safeMoney(n: number | null | undefined): number | null {
    if (n == null) return null;
    if (!Number.isFinite(n) || n < 0 || n > 9999999.99) return null;
    return Math.round(n * 100) / 100;
  }
  const talentFeeClean = safeMoney(input.talentFee);
  const otherExpensesClean = safeMoney(input.otherExpenses);
  const travelCostClean = safeMoney(input.travelCost);

  // Create event — venue details stored as flat columns (venue_name, venue_address, city, capacity)
  const eventMetadata = mergeEventCommercialMetadata(
    {
      timezone: tz,
      ...(dressCode ? { dress_code: dressCode } : {}),
      ...(hostMessage ? { host_message: hostMessage } : {}),
    },
    {
      venueCost: input.venueCost ?? null,
      venueDeposit: input.venueDeposit ?? null,
      barMinimum: input.barMinimum ?? null,
      projectedBarSales: input.projectedBarSales ?? input.estimatedBarRevenue ?? null,
      barPercent: input.barPercent ?? null,
    }
  );

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      collective_id: collectiveId,
      title: trimmedTitle,
      slug: eventSlug,
      description: enrichedDescription,
      starts_at: startsAt,
      ends_at: endsAt,
      doors_at: doorsAt,
      venue_name: input.venueName,
      venue_address: trimmedAddress,
      city: input.venueCity,
      capacity: input.venueCapacity || null,
      status: "draft",
      is_free: isFree,
      vibe_tags: vibeTags.length > 0 ? vibeTags : undefined,
      metadata: eventMetadata as Json,
    })
    .select("id")
    .maybeSingle();

  if (eventError) {
    console.error("[createEvent] event insert error:", eventError.message);
    return { error: "Failed to create event" };
  }
  if (!event) return { error: "Failed to create event" };

  // Create ticket tiers (with price rounding)
  if (input.tiers.length > 0) {
    const { error: tierError } = await admin.from("ticket_tiers").insert(
      input.tiers.map((t, i) => ({
        event_id: event.id,
        name: t.name.trim(),
        price: Math.round(t.price * 100) / 100,
        capacity: t.quantity,
        sort_order: i,
      }))
    );

    if (tierError) {
      console.error("Ticket tier error:", tierError);
      // Cleanup: delete the event that was just created
      await admin.from("events").delete().eq("id", event.id);
      console.error("[createEvent] tier error:", tierError.message);
      return { error: "Failed to create ticket tiers" };
    }
  }

  // Persist budget-step line items as event_expense rows so the P&L reads them
  // back without asking the user to re-enter every cost. Failure here is
  // non-fatal — the event itself is already saved and the user can re-add
  // expenses manually on the financials page.
  type BudgetExpenseRow = { event_id: string; category: string; description: string; amount: number };
  const budgetExpenseRows: BudgetExpenseRow[] = [];

  if (input.expenseItems && input.expenseItems.length > 0) {
    for (const it of input.expenseItems) {
      const amt = safeMoney(it.amount);
      if (!amt || amt <= 0) continue;
      budgetExpenseRows.push({
        event_id: event.id,
        description: it.label.slice(0, 200),
        category: it.category,
        amount: amt,
      });
    }
  } else {
    // Legacy path — scalar fields only. Kept for backward compat with any
    // caller that hasn't migrated to itemized input yet.
    if (talentFeeClean && talentFeeClean > 0) {
      budgetExpenseRows.push({
        event_id: event.id,
        description: "Talent fee", category: "artist", amount: talentFeeClean,
      });
    }
    if (travelCostClean && travelCostClean > 0) {
      budgetExpenseRows.push({
        event_id: event.id,
        description: "Talent travel (flights, hotel, transport)",
        category: "transportation", amount: travelCostClean,
      });
    }
    if (otherExpensesClean && otherExpensesClean > 0) {
      budgetExpenseRows.push({
        event_id: event.id,
        description: "Other expenses (sound, lights, security, promo)",
        category: "other", amount: otherExpensesClean,
      });
    }
  }

  if (budgetExpenseRows.length > 0) {
    const { error: expErr } = await admin.from("event_expenses").insert(budgetExpenseRows);
    if (expErr) {
      console.error("[createEvent] budget expense insert failed (non-fatal):", expErr.message);
    }
  }

  // Track event creation
  import("@/lib/track-server").then(({ trackServerEvent }) =>
    trackServerEvent("event_created", { eventId: event.id, title: trimmedTitle, collectiveId: memberships[0].collective_id })
  ).catch(() => {});

  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard");
  return { error: null, eventId: event.id };
  } catch (err) {
    console.error("[createEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function updateEvent(eventId: string, input: UpdateEventInput) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  if (!eventId?.trim()) return { error: "Event ID is required" };

  if (input.description && input.description.length > 5000) {
    return { error: "Description is too long. Please keep it under 5,000 characters." };
  }

  // Title validation (mirrors createEvent)
  const trimmedTitle = input.title?.trim();
  if (!trimmedTitle || trimmedTitle.length === 0) {
    return { error: "Event title is required." };
  }
  if (trimmedTitle.length > 200) {
    return { error: "Event title must be under 200 characters." };
  }

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  // B05: draft + published are editable. Completed/settled/cancelled remain
  // locked. The UI mirrors this decision in edit/page.tsx.
  const EDITABLE_STATUSES = ["draft", "published"];
  if (!EDITABLE_STATUSES.includes(ownership.event.status)) {
    return { error: `Events in status "${ownership.event.status}" can't be edited — duplicate the event to make changes.` };
  }

  const admin = createAdminClient();

  // Only regenerate slug when title actually changed — check collision within same collective
  const { data: currentEventRow } = await admin
    .from("events")
    .select("title, collective_id, metadata")
    .eq("id", eventId)
    .maybeSingle();

  let newSlug: string | null = null;
  if (currentEventRow && currentEventRow.title !== trimmedTitle) {
    const baseSlug = slugify(trimmedTitle);
    newSlug = baseSlug;
    const { data: slugCollision } = await admin
      .from("events")
      .select("id")
      .eq("collective_id", currentEventRow.collective_id)
      .eq("slug", newSlug)
      .neq("id", eventId)
      .maybeSingle();
    if (slugCollision) {
      newSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }
  }

  // Build timestamps with timezone awareness (same approach as createEvent)
  const tz = input.timezone ?? DEFAULT_TIMEZONE;
  function toTimestamp(date: string, time: string): string {
    const dt = new Date(`${date}T${time}:00`);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(dt);
    const offsetPart = parts.find(p => p.type === "timeZoneName")?.value ?? "+00:00";
    const offset = offsetPart.replace("GMT", "") || "+00:00";
    return `${date}T${time}:00${offset}`;
  }

  const startsAt = toTimestamp(input.date, input.startTime);

  // Cross-midnight handling: if end time is before start time, add one day
  let endDate = input.date;
  if (input.endTime) {
    const [startHour, startMinute] = input.startTime.split(":").map(Number);
    const [endHour, endMinute] = input.endTime.split(":").map(Number);
    if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
      const nextDay = new Date(`${input.date}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      endDate = nextDay.toISOString().split("T")[0];
    }
  }

  const endsAt = input.endTime
    ? toTimestamp(endDate, input.endTime)
    : null;
  const doorsAt = input.doorsOpen
    ? toTimestamp(input.date, input.doorsOpen)
    : null;

  // Validate tier prices before any DB writes
  if (input.tiers.some((t) => t.price < 0)) {
    return { error: "Tier prices cannot be negative" };
  }

  // Update event — venue stored as flat columns
  const eventUpdatePayload: Record<string, unknown> = {
    title: trimmedTitle,
    description: input.description,
    starts_at: startsAt,
    ends_at: endsAt,
    doors_at: doorsAt,
    venue_name: input.venueName,
    venue_address: input.venueAddress,
    city: input.venueCity,
    capacity: input.venueCapacity || null,
    metadata: mergeEventCommercialMetadata(currentEventRow?.metadata, {
      venueCost: input.venueCost ?? null,
      venueDeposit: input.venueDeposit ?? null,
      barMinimum: input.barMinimum ?? null,
      projectedBarSales: input.projectedBarSales ?? input.estimatedBarRevenue ?? null,
      barPercent: input.barPercent ?? null,
    }) as Json,
  };
  if (newSlug) {
    eventUpdatePayload.slug = newSlug;
  }
  const { error: eventError } = await admin
    .from("events")
    .update(eventUpdatePayload)
    .eq("id", eventId);

  if (eventError) {
    console.error("[updateEvent] event update error:", eventError.message);
    return { error: "Failed to update event" };
  }

  // Remove deleted tiers
  if (input.removedTierIds.length > 0) {
    const { error: deleteError } = await admin
      .from("ticket_tiers")
      .delete()
      .in("id", input.removedTierIds)
      .eq("event_id", eventId);

    if (deleteError) {
      console.error("[updateEvent] tier delete error:", deleteError.message);
      return { error: "Failed to remove ticket tiers" };
    }
  }

  // Upsert tiers (update existing, insert new)
  for (let i = 0; i < input.tiers.length; i++) {
    const tier = input.tiers[i];
    if (tier.id) {
      // Update existing tier
      const { error: tierError } = await admin
        .from("ticket_tiers")
        .update({
          name: tier.name,
          price: tier.price,
          capacity: tier.quantity,
          sort_order: i,
        })
        .eq("id", tier.id)
        .eq("event_id", eventId);

      if (tierError) {
        console.error("[updateEvent] tier update error:", tierError.message);
        return { error: "Failed to update ticket tier" };
      }
    } else {
      // Insert new tier
      const { error: tierError } = await admin
        .from("ticket_tiers")
        .insert({
          event_id: eventId,
          name: tier.name,
          price: tier.price,
          capacity: tier.quantity,
          sort_order: i,
        });

      if (tierError) {
        console.error("[updateEvent] tier insert error:", tierError.message);
        return { error: "Failed to add ticket tier" };
      }
    }
  }

  // ── Reconcile itemized expenses ──
  // Only runs when expenseItems is explicitly provided — undefined means
  // "leave existing expenses alone", which matches legacy behavior.
  if (input.expenseItems !== undefined) {
    // Delete explicitly-removed rows first, scoped to this event.
    if (input.removedExpenseIds && input.removedExpenseIds.length > 0) {
      const { error: delErr } = await admin
        .from("event_expenses")
        .delete()
        .in("id", input.removedExpenseIds)
        .eq("event_id", eventId);
      if (delErr) {
        console.error("[updateEvent] expense delete error:", delErr.message);
        // Non-fatal; continue so upserts still land.
      }
    }

    for (const it of input.expenseItems) {
      if (!Number.isFinite(it.amount) || it.amount < 0 || it.amount > 10_000_000) continue;
      const label = (it.label ?? "").toString().slice(0, 200);
      const category = (it.category ?? "other").toString().slice(0, 50);
      const amt = Math.round(it.amount * 100) / 100;
      if (amt <= 0) continue;

      if (it.id) {
        const { error: upErr } = await admin
          .from("event_expenses")
          .update({
            description: label,
            category,
            amount: amt,
          })
          .eq("id", it.id)
          .eq("event_id", eventId); // tenancy guard
        if (upErr) {
          console.error("[updateEvent] expense update error:", upErr.message);
        }
      } else {
        const { error: insErr } = await admin
          .from("event_expenses")
          .insert({
            event_id: eventId,
            description: label,
            category,
            amount: amt,
          });
        if (insErr) {
          console.error("[updateEvent] expense insert error:", insErr.message);
        }
      }
    }
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");

  return { error: null };
  } catch (err) {
    console.error("[updateEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

async function verifyEventOwnership(userId: string, eventId: string) {
  const admin = createAdminClient();

  // Get user's collectives
  const { data: memberships, error: membershipsError } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (membershipsError) {
    console.error("[verifyEventOwnership] memberships query error:", membershipsError.message);
    return { error: "Failed to verify membership.", event: null };
  }

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found.", event: null };
  }

  const collectiveIds = memberships.map((m) => m.collective_id);

  // Fetch event and verify it belongs to one of user's collectives
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, status, collective_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error("[verifyEventOwnership] event query error:", eventError.message);
    return { error: "Failed to load event.", event: null };
  }

  if (!event) {
    return { error: "Event not found.", event: null };
  }

  if (!collectiveIds.includes(event.collective_id)) {
    return { error: "You don't have permission to manage this event.", event: null };
  }

  return { error: null, event };
}

export async function publishEvent(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  if (!eventId?.trim()) return { error: "Event ID is required" };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  if (ownership.event.status !== "draft") {
    return { error: `Cannot publish an event with status "${ownership.event.status}". Only draft events can be published.` };
  }

  const admin = createAdminClient();

  const [tiersRes, eventRes] = await Promise.all([
    admin
      .from("ticket_tiers")
      .select("price")
      .eq("event_id", eventId),
    admin
      .from("events")
      .select("title, starts_at, venue_name, collective_id")
      .eq("id", eventId)
      .maybeSingle(),
  ]);

  if (tiersRes.error) {
    console.error("[publishEvent] tier query error:", tiersRes.error.message);
    return { error: "Failed to verify ticket tiers" };
  }

  if (eventRes.error || !eventRes.data) {
    console.error("[publishEvent] event query error:", eventRes.error?.message);
    return { error: "Failed to load event" };
  }

  const tierRows = tiersRes.data ?? [];
  if (tierRows.length === 0) {
    return { error: "Add at least one ticket tier before publishing. Your event needs a way for people to get in." };
  }

  if (!eventRes.data.title?.trim() || !eventRes.data.starts_at || !eventRes.data.venue_name?.trim()) {
    return { error: "Finish the event details before publishing. Title, date, and venue are required." };
  }

  // TODO: needs schema decision — stripe_account_id/stripe_charges_enabled/stripe_details_submitted
  // columns were removed from collectives in the schema rebuild. Stripe check skipped for now.

  // B09: set published_at so analytics (funnel, sales curve, days-since-publish)
  // have a ground-truth timestamp. Previously only status/is_published flipped.
  const { error: publishError } = await admin
    .from("events")
    .update({
      status: "published",
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (publishError) {
    console.error("[publishEvent] update error:", publishError.message);
    return { error: "Failed to publish event" };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");

  import("@/lib/track-server").then(({ trackServerEvent }) =>
    trackServerEvent("event_published", { eventId })
  ).catch(() => {});

  return { error: null };
  } catch (err) {
    console.error("[publishEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function cancelEvent(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  if (!eventId?.trim()) return { error: "Event ID is required" };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  const status = ownership.event.status;
  if (status === "cancelled") {
    return { error: "Event is already cancelled." };
  }
  if (status === "completed") {
    return { error: "Cannot cancel a completed event." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);

  if (error) {
    console.error("[cancelEvent] update error:", error.message);
    return { error: "Failed to cancel event" };
  }

  // --- Refund all paid orders for this event ---
  const { data: paidOrders, error: ordersError } = await admin
    .from("orders")
    .select("id, total, stripe_payment_intent_id")
    .eq("event_id", eventId)
    .eq("status", "paid");

  if (ordersError) {
    console.error("[cancelEvent] orders query error:", ordersError.message);
  }

  const refundResults: { orderId: string; success: boolean; error?: string }[] = [];

  if (paidOrders && paidOrders.length > 0) {
    const stripe = getStripe();

    const results = await Promise.allSettled(
      paidOrders.map(async (order) => {
        const total = Number(order.total) || 0;

        // Issue Stripe refund if there was a real payment
        if (order.stripe_payment_intent_id && total > 0) {
          try {
            await stripe.refunds.create({
              payment_intent: order.stripe_payment_intent_id,
              amount: Math.round(total * 100),
              reason: "requested_by_customer",
            });
          } catch (stripeErr) {
            const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe refund failed";
            console.error(`[cancelEvent] Stripe refund failed for order ${order.id}:`, msg);
            throw new Error(msg);
          }
        }

        // Update order to refunded
        const { error: updateErr } = await admin
          .from("orders")
          .update({ status: "refunded" })
          .eq("id", order.id);

        if (updateErr) throw new Error(updateErr.message);
        return order.id;
      })
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        refundResults.push({ orderId: paidOrders[i].id, success: true });
      } else {
        console.error(`[cancelEvent] refund failed for order ${paidOrders[i].id}:`, result.reason?.message);
        refundResults.push({ orderId: paidOrders[i].id, success: false, error: "Refund failed" });
      }
    });
  }

  // --- Cancel all tickets for this event ---
  await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("event_id", eventId)
    .not("status", "in", "(cancelled)");

  // --- Cancel waitlist entries (ticket_waitlist keyed by tier) ---
  const { data: eventTiers } = await admin
    .from("ticket_tiers")
    .select("id")
    .eq("event_id", eventId);

  if (eventTiers && eventTiers.length > 0) {
    const tierIds = eventTiers.map((t) => t.id);
    await admin
      .from("ticket_waitlist")
      .delete()
      .in("tier_id", tierIds);
  }

  // --- Log the cancellation in event_activity ---
  await admin
    .from("event_activity")
    .insert({
      event_id: eventId,
      user_id: user.id,
      action: "event_cancelled",
      metadata: {
        cancelled_at: new Date().toISOString(),
        orders_refunded: refundResults.filter((r) => r.success).length,
        orders_failed: refundResults.filter((r) => !r.success).length,
        previous_status: status,
      },
    });

  revalidatePath("/dashboard/events");

  const failedRefunds = refundResults.filter((r) => !r.success);
  if (failedRefunds.length > 0) {
    return {
      error: null,
      warning: `Event cancelled but ${failedRefunds.length} order refund(s) failed. Check the dashboard to retry.`,
      failedRefunds,
    };
  }

  return { error: null };
  } catch (err) {
    console.error("[cancelEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function completeEvent(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  if (!eventId?.trim()) return { error: "Event ID is required" };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };
  if (!ownership.event) return { error: "Event not found." };

  const status = ownership.event.status;
  if (status !== "published" && status !== "upcoming") {
    return { error: `Cannot complete an event with status "${status}". Only published or upcoming events can be completed.` };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("events")
    .update({ status: "completed" })
    .eq("id", eventId);

  if (error) {
    console.error("[completeEvent] update error:", error.message);
    return { error: "Failed to complete event" };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/finance");

  // Auto-generate settlement + CRM enrichment
  const settlementResult = await generateAutoSettlement(eventId);
  if (settlementResult.error) {
    console.error("Auto-settlement warning:", settlementResult.error);
    // Non-fatal — event was still completed successfully
  }

  return { error: null };
  } catch (err) {
    console.error("[completeEvent] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

/**
 * Duplicate an existing event into a fresh draft. Copies title (with " (Copy)"
 * suffix), description, venue fields, ticket tiers, and expense rows.
 * Defaults the new starts_at to 7 days from today at the source event's
 * time-of-day; doors_at and ends_at are shifted by the same delta so the
 * relative timing is preserved. Skips bookings, tickets, attendees,
 * settlements, and anything that's specific to the original run.
 */
export async function duplicateEvent(sourceEventId: string) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be logged in.", eventId: null };

    if (!sourceEventId?.trim()) return { error: "Event ID is required", eventId: null };

    const ownership = await verifyEventOwnership(user.id, sourceEventId);
    if (ownership.error) return { error: ownership.error, eventId: null };
    if (!ownership.event) return { error: "Event not found.", eventId: null };

    const admin = createAdminClient();

    // Pull the full source event row + tiers + expenses in parallel.
    const [sourceEventRes, sourceTiersRes, sourceExpensesRes] = await Promise.all([
      admin
        .from("events")
        .select(
          "title, description, starts_at, ends_at, doors_at, venue_name, venue_address, city, capacity, collective_id, is_free, vibe_tags, min_age, flyer_url, metadata"
        )
        .eq("id", sourceEventId)
        .maybeSingle(),
      admin
        .from("ticket_tiers")
        .select("name, price, capacity, sort_order")
        .eq("event_id", sourceEventId)
        .order("sort_order", { ascending: true }),
      admin
        .from("event_expenses")
        .select("description, category, amount")
        .eq("event_id", sourceEventId),
    ]);

    if (sourceEventRes.error || !sourceEventRes.data) {
      console.error("[duplicateEvent] source fetch failed:", sourceEventRes.error?.message);
      return { error: "Failed to load source event", eventId: null };
    }
    const source = sourceEventRes.data;

    // Shift dates: new starts_at = today + 7 days at original time-of-day.
    // Preserve doors_at and ends_at offsets relative to starts_at.
    const sourceStart = new Date(source.starts_at);
    const newStart = new Date();
    newStart.setDate(newStart.getDate() + 7);
    newStart.setHours(
      sourceStart.getHours(),
      sourceStart.getMinutes(),
      sourceStart.getSeconds(),
      0
    );
    const deltaMs = newStart.getTime() - sourceStart.getTime();
    const newDoors = source.doors_at
      ? new Date(new Date(source.doors_at).getTime() + deltaMs).toISOString()
      : null;
    const newEnds = source.ends_at
      ? new Date(new Date(source.ends_at).getTime() + deltaMs).toISOString()
      : null;

    // Generate a new unique slug.
    const baseTitle = `${source.title} (Copy)`;
    const baseSlug = slugify(baseTitle);
    let newSlug = baseSlug || `event-${Math.random().toString(36).slice(2, 8)}`;
    const { data: slugCollision } = await admin
      .from("events")
      .select("id")
      .eq("slug", newSlug)
      .maybeSingle();
    if (slugCollision) {
      newSlug = `${newSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // Create the new draft event.
    const { data: newEvent, error: insertErr } = await admin
      .from("events")
      .insert({
        collective_id: source.collective_id,
        title: baseTitle,
        slug: newSlug,
        description: source.description,
        starts_at: newStart.toISOString(),
        ends_at: newEnds,
        doors_at: newDoors,
        venue_name: source.venue_name,
        venue_address: source.venue_address,
        city: source.city,
        capacity: source.capacity,
        status: "draft",
        is_free: source.is_free,
        vibe_tags: source.vibe_tags ?? undefined,
        min_age: source.min_age,
        flyer_url: source.flyer_url,
        metadata: source.metadata ?? undefined,
      })
      .select("id")
      .maybeSingle();

    if (insertErr || !newEvent) {
      console.error("[duplicateEvent] insert error:", insertErr?.message);
      return { error: "Failed to duplicate event", eventId: null };
    }

    // Clone ticket tiers (best-effort — non-fatal if missing).
    if (sourceTiersRes.data && sourceTiersRes.data.length > 0) {
      const { error: tierErr } = await admin.from("ticket_tiers").insert(
        sourceTiersRes.data.map((t) => ({
          event_id: newEvent.id,
          name: t.name,
          price: t.price,
          capacity: t.capacity,
          sort_order: t.sort_order,
        }))
      );
      if (tierErr) {
        console.error("[duplicateEvent] tier clone failed (non-fatal):", tierErr.message);
      }
    }

    // Clone expense rows (best-effort — non-fatal).
    if (sourceExpensesRes.data && sourceExpensesRes.data.length > 0) {
      const { error: expErr } = await admin.from("event_expenses").insert(
        sourceExpensesRes.data.map((e) => ({
          event_id: newEvent.id,
          description: e.description,
          category: e.category,
          amount: e.amount,
        }))
      );
      if (expErr) {
        console.error("[duplicateEvent] expense clone failed (non-fatal):", expErr.message);
      }
    }

    revalidatePath("/dashboard/events");
    revalidatePath("/dashboard");
    return { error: null, eventId: newEvent.id };
  } catch (err) {
    console.error("[duplicateEvent] Unexpected error:", err);
    return { error: "Something went wrong", eventId: null };
  }
}

interface EventDesignInput {
  flyerUrl?: string | null;
  description?: string | null;
  vibeTags?: string[];
  minAge?: number | null;
  dressCode?: string | null;
  themeColor?: string | null;
  hostMessage?: string | null;
}

export async function updateEventDesign(eventId: string, input: EventDesignInput) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in." };

  if (!eventId?.trim()) return { error: "Event ID is required" };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error };

  // Validate description length
  if (input.description != null && input.description.length > 5000) {
    return { error: "Description is too long. Please keep it under 5,000 characters." };
  }

  // Validate flyerUrl: require https:// and cap length at 500
  if (input.flyerUrl != null && input.flyerUrl !== "") {
    if (typeof input.flyerUrl !== "string" || input.flyerUrl.length > 500) {
      return { error: "Invalid flyer URL" };
    }
    if (!/^https:\/\//i.test(input.flyerUrl)) {
      return { error: "Invalid flyer URL" };
    }
  }

  // Validate themeColor against strict hex regex (prevents CSS injection)
  if (input.themeColor != null && input.themeColor !== "") {
    if (
      typeof input.themeColor !== "string" ||
      !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(input.themeColor)
    ) {
      return { error: "Invalid theme color" };
    }
  }

  // Cap vibeTags at 10 items, each max 50 chars; trim each
  let sanitizedVibeTags: string[] | undefined;
  if (input.vibeTags !== undefined) {
    if (!Array.isArray(input.vibeTags)) {
      return { error: "Invalid vibe tags" };
    }
    sanitizedVibeTags = input.vibeTags
      .slice(0, 10)
      .map((t) => (typeof t === "string" ? t.trim().slice(0, 50) : ""))
      .filter((t) => t.length > 0);
  }

  // Bound minAge 0-99 integer
  if (input.minAge != null) {
    if (!Number.isInteger(input.minAge) || input.minAge < 0 || input.minAge > 99) {
      return { error: "Invalid minimum age" };
    }
  }

  // Cap dressCode at 200 chars, hostMessage at 500 chars. Trim both.
  let sanitizedDressCode: string | null | undefined;
  if (input.dressCode !== undefined) {
    if (input.dressCode === null) {
      sanitizedDressCode = null;
    } else if (typeof input.dressCode !== "string") {
      return { error: "Invalid dress code" };
    } else {
      sanitizedDressCode = input.dressCode.trim().slice(0, 200);
    }
  }

  let sanitizedHostMessage: string | null | undefined;
  if (input.hostMessage !== undefined) {
    if (input.hostMessage === null) {
      sanitizedHostMessage = null;
    } else if (typeof input.hostMessage !== "string") {
      return { error: "Invalid host message" };
    } else {
      sanitizedHostMessage = input.hostMessage.trim().slice(0, 500);
    }
  }

  const admin = createAdminClient();

  // Fetch current metadata to merge
  const { data: currentEvent } = await admin
    .from("events")
    .select("metadata")
    .eq("id", eventId)
    .maybeSingle();

  const existingMetadata = (currentEvent?.metadata ?? {}) as Record<string, unknown>;

  // Build update payload
  const updatePayload: Record<string, unknown> = {};

  if (input.flyerUrl !== undefined) {
    updatePayload.flyer_url = input.flyerUrl;
  }
  if (input.description !== undefined) {
    updatePayload.description = input.description;
  }
  if (sanitizedVibeTags !== undefined) {
    updatePayload.vibe_tags = sanitizedVibeTags;
  }
  if (input.minAge !== undefined) {
    updatePayload.min_age = input.minAge;
  }

  // Store extras in metadata JSONB
  const newMetadata = { ...existingMetadata };
  if (sanitizedDressCode !== undefined) {
    newMetadata.dressCode = sanitizedDressCode;
  }
  if (input.themeColor !== undefined) {
    newMetadata.themeColor = input.themeColor;
  }
  if (sanitizedHostMessage !== undefined) {
    newMetadata.hostMessage = sanitizedHostMessage;
  }
  updatePayload.metadata = newMetadata;

  const { error } = await admin
    .from("events")
    .update(updatePayload)
    .eq("id", eventId);

  if (error) {
    console.error("[updateEventDesign] update error:", error.message);
    return { error: "Failed to update event design" };
  }
  return { error: null };
  } catch (err) {
    console.error("[updateEventDesign] Unexpected error:", err);
    return { error: "Something went wrong" };
  }
}

export async function getEventDesign(eventId: string) {
  try {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in.", event: null };

  if (!eventId?.trim()) return { error: "Event ID is required", event: null };

  const ownership = await verifyEventOwnership(user.id, eventId);
  if (ownership.error) return { error: ownership.error, event: null };

  const admin = createAdminClient();
  const [eventRes, artistsRes] = await Promise.all([
    admin
      .from("events")
      .select("id, title, slug, description, flyer_url, vibe_tags, min_age, metadata, collective_id, starts_at, doors_at, venue_name, venue_address, city")
      .eq("id", eventId)
      .maybeSingle(),
    admin
      .from("event_artists")
      .select("name")
      .eq("event_id", eventId),
  ]);

  if (eventRes.error || artistsRes.error) {
    console.error("[getEventDesign]", eventRes.error?.message || artistsRes.error?.message);
    return { error: "Failed to load event data", event: null };
  }

  const event = eventRes.data;
  if (!event) return { error: "Event not found.", event: null };

  // Get collective slug for preview link
  const { data: collective } = await admin
    .from("collectives")
    .select("slug")
    .eq("id", event.collective_id)
    .maybeSingle();

  // Extract artist names for poster pre-fill
  const artistNames = (artistsRes.data || [])
    .map((a) => a.name)
    .filter(Boolean);

  const dateDisplay = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })
    : null;

  const timeDisplay = event.starts_at
    ? new Date(event.starts_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
    : null;

  const doorsDisplay = event.doors_at
    ? new Date(event.doors_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })
    : null;

  return {
    error: null,
    event: {
      ...event,
      collectiveSlug: collective?.slug ?? null,
      venueName: event.venue_name ?? null,
      venueCity: event.city ?? null,
      venueAddress: event.venue_address ?? null,
      artistNames,
      dateDisplay,
      timeDisplay,
      doorsDisplay,
    },
  };
  } catch (err) {
    console.error("[getEventDesign] Unexpected error:", err);
    return { error: "Something went wrong", event: null };
  }
}
